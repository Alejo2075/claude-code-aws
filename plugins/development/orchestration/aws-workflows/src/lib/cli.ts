import {
  type ArchitectureGraph,
  fromStateMachine,
  toMermaid,
} from "@claude-code-aws/architecture-graph";
import {
  defineCli,
  localReport,
  noTemplates,
  reportResult,
  staticFinding,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType } from "@claude-code-aws/template-analysis";

import { definitionOf, type Issue, validateAsl } from "./asl.js";
import { summarizeHistory } from "./history.js";
import { simulate } from "./sim.js";

const SEVERITY = { error: "high", warning: "low" } as const;

const issueFinding = (subject: string, i: Issue, n: number): Finding =>
  staticFinding("aws-workflows", {
    ruleId: `WFL-${i.level === "error" ? "INVALID" : "RISK"}`,
    severity: SEVERITY[i.level],
    title: `${i.path} ${i.message}`,
    explanation: i.message,
    subject: `${subject}:${n}:${i.path}`,
    resources: [subject],
  });

const renderIssues = (issues: Issue[]): string =>
  issues.map((i) => `${i.level.toUpperCase().padEnd(7)} ${i.path} ${i.message}`).join("\n");

export const runCli = defineCli({
  name: "aws-workflows",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it starts no execution and changes no state machine.",
  valued: ["type", "input", "mock", "history"],
  commands: {
    validate: {
      help: "<definition.json> [--type STANDARD|EXPRESS]  Check an Amazon States Language definition",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("validate needs a definition file", 2);
        const type = ctx.args.one("type") ?? "STANDARD";
        if (type !== "STANDARD" && type !== "EXPRESS")
          return ctx.fail("--type must be STANDARD or EXPRESS", 2);
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        const issues = validateAsl(json.value, { type });
        const errors = issues.filter((i) => i.level === "error").length;
        return {
          exitCode: errors > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(issues, null, 2)
            : issues.length === 0
              ? "Valid: no structural problems found. This checks shape and flow, not whether resources exist or roles allow the calls."
              : `${renderIssues(issues)}\n${errors} error(s), ${issues.length - errors} warning(s).`,
        };
      },
    },
    inspect: {
      help: "[path]  State machines in cdk.out, validated",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const findings: Finding[] = [];
        const lines: string[] = [];
        for (const stack of stacks)
          for (const sm of resourcesOfType(stack.template, "AWS::StepFunctions::StateMachine")) {
            const id = `${stack.name}/${sm.logicalId}`;
            const type = sm.properties["StateMachineType"] === "EXPRESS" ? "EXPRESS" : "STANDARD";
            const def = definitionOf(sm.properties);
            if (def === null) {
              lines.push(
                `  ${id} (${type}): definition could not be read from the template (it may be loaded from S3)`,
              );
              continue;
            }
            const issues = validateAsl(def, { type });
            lines.push(
              `  ${id} (${type}): ${issues.filter((i) => i.level === "error").length} error(s), ${issues.filter((i) => i.level === "warning").length} warning(s)`,
            );
            issues.forEach((i, n) => findings.push(issueFinding(id, i, n)));
            const tracing = sm.properties["TracingConfiguration"];
            const logging = sm.properties["LoggingConfiguration"];
            if (logging === undefined)
              findings.push(
                staticFinding("aws-workflows", {
                  ruleId: "WFL-NO-LOGGING",
                  severity: type === "EXPRESS" ? "medium" : "low",
                  title: "State machine has no logging configuration",
                  explanation:
                    type === "EXPRESS"
                      ? "Express executions keep no history in the service: without logs, a failure leaves no record."
                      : "Standard executions keep history in the service, but logs make it searchable and longer lived.",
                  subject: id,
                  resources: [id],
                }),
              );
            if (tracing === undefined)
              findings.push(
                staticFinding("aws-workflows", {
                  ruleId: "WFL-NO-TRACING",
                  severity: "info",
                  title: "X-Ray tracing is not enabled",
                  explanation: "Without tracing, calls across services are harder to follow.",
                  subject: id,
                  resources: [id],
                }),
              );
          }
        const report = localReport(
          "aws-workflows",
          `${lines.length} state machine(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "References inside definitions are replaced by placeholders before checking.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [`State machines:\n${lines.join("\n")}`, ...problems]);
      },
    },
    graph: {
      help: "<definition.json>  The state graph as Mermaid and ArchitectureGraph JSON (for aws-diagrams)",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("graph needs a definition file", 2);
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        const g: ArchitectureGraph = fromStateMachine(json.value, "State machine");
        return g.nodes.length === 0 ? ctx.fail("no States to draw") : ctx.out(g, toMermaid(g));
      },
    },
    simulate: {
      help: "<definition.json> --input <input.json> [--mock Name=<result.json>]...  Walk the machine logically (not an execution)",
      run: (ctx) => {
        const file = ctx.words[0];
        const inputFile = ctx.args.one("input");
        if (file === undefined || inputFile === undefined)
          return ctx.fail("simulate needs a definition file and --input <input.json>", 2);
        const def = ctx.readJson(file);
        const input = ctx.readJson(inputFile);
        if (!def.ok) return ctx.fail(def.error);
        if (!input.ok) return ctx.fail(input.error);
        const mocks: Record<string, unknown> = {};
        for (const m of ctx.args.options.get("mock") ?? []) {
          const [name, path] = m.split("=");
          if (name === undefined || path === undefined)
            return ctx.fail("--mock must look like StateName=result.json", 2);
          const r = ctx.readJson(path);
          if (!r.ok) return ctx.fail(r.error);
          mocks[name] = r.value;
        }
        const r = simulate(def.value, input.value, mocks);
        const text = [
          `LOGICAL SIMULATION (no service called, nothing waited for, not an AWS execution)`,
          ...r.steps.map(
            (s, i) => `${String(i + 1).padStart(2)}. ${s.state} (${s.type}): ${s.note}`,
          ),
          `Result: ${r.status}: ${r.reason}`,
        ];
        return ctx.out(r, text.join("\n"));
      },
    },
    debug: {
      help: "--history <events.json>  Summarize an execution history you exported (get-execution-history)",
      run: (ctx) => {
        const file = ctx.args.one("history");
        if (file === undefined)
          return ctx.fail(
            "debug needs --history <file> from `aws stepfunctions get-execution-history` (you run that; this plugin does not)",
            2,
          );
        const json = ctx.readJson(file, 20_000_000);
        if (!json.ok) return ctx.fail(json.error);
        const s = summarizeHistory(json.value);
        if (s === null)
          return ctx.fail("the file is not an execution history (expected an `events` list)");
        const text = [
          `Execution ${s.status}, ${s.events} events. States entered, in order: ${s.entered.join(" -> ") || "none"}`,
          ...s.failures.map((f) =>
            `Failure in ${f.state || "(unknown state)"} (${f.type}) at ${f.at}: ${f.error} ${f.cause}`.trim(),
          ),
          s.failures.length === 0
            ? "No failure events in this history."
            : "This is what the history records; the cause text comes from the failing service and is truncated and redacted.",
        ];
        return ctx.out(s, text.join("\n"));
      },
    },
  },
});

import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";
import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { planInvoke, TOPICS } from "./invoke.js";
import { inventory, rules } from "./rules.js";
import { EVENTS, type EventKind, NAME, scaffold } from "./scaffold.js";

export const runCli = defineCli({
  name: "aws-lambda",
  promise:
    "Reads files inside the project. Writes only new files with --write. No AWS calls: it invokes no function and changes no configuration.",
  valued: ["name", "event", "function", "region", "payload", "qualifier"],
  flags: ["write", "async"],
  commands: {
    inspect: {
      help: "[path]  Functions in cdk.out with runtime, memory, timeout, env key names, and findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template, ctx.now));
        const report = localReport(
          "aws-lambda",
          `${rows.length} function(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared). Environment variable values are never shown.`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Function code, real durations, and cold start times are not visible in a template.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Functions:\n${rows.map((r) => `  ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    create: {
      help: "--name <slug> --event sqs|apigw-http|eventbridge|s3|sns|scheduled [--write]  A TypeScript handler with validation, logging, an idempotency hook, a test, and a local harness",
      run: (ctx) => {
        const name = ctx.args.one("name");
        const kind = ctx.args.one("event");
        if (name === undefined || !NAME.test(name))
          return ctx.fail("create needs --name (lowercase letters, digits, dashes)", 2);
        if (kind === undefined || !(EVENTS as readonly string[]).includes(kind))
          return ctx.fail(`create needs --event, one of: ${EVENTS.join(", ")}`, 2);
        const s = scaffold(name, kind as EventKind);
        if (!ctx.args.flags.has("write"))
          return ctx.out(
            s,
            `${s.files.map((f) => `--- ${f.path}\n${f.content}`).join("\n")}\n(Draft only; add --write to create these ${s.files.length} files. Types come from @types/aws-lambda, which your project must have.)`,
          );
        const lines = s.files.map((f) => ctx.save(f.path, f.content));
        return {
          exitCode: lines.some((l) => l.startsWith("Not written")) ? 1 : 0,
          stdout: [
            ...lines,
            "The local harness runs the handler once with a sample event; it does not invoke Lambda.",
          ].join("\n"),
        };
      },
    },
    invoke: {
      help: "--function <name|arn> --region <r> --payload <file> [--qualifier v] [--async]  Prepare an invoke command (never run)",
      run: (ctx) => {
        const fn = ctx.args.one("function");
        const region = ctx.args.one("region");
        const payload = ctx.args.one("payload");
        if (fn === undefined || region === undefined || payload === undefined)
          return ctx.fail("invoke needs --function, --region, and --payload <file>", 2);
        const read = ctx.readText(payload, 7 * 1024 * 1024);
        if (!read.ok) return ctx.fail(read.error);
        try {
          JSON.parse(read.text);
        } catch {
          return ctx.fail(
            `${payload} is not valid JSON; a malformed payload would fail inside the function`,
          );
        }
        const abs = isAbsolute(payload) ? payload : resolve(ctx.root, payload);
        let bytes = Buffer.byteLength(read.text);
        try {
          bytes = statSync(abs).size;
        } catch {
          // The text length is a good enough size.
        }
        const q = ctx.args.one("qualifier");
        const plan = planInvoke({
          fn,
          region,
          payloadFile: payload,
          payloadBytes: bytes,
          async: ctx.args.flags.has("async"),
          ...(q === undefined ? {} : { qualifier: q }),
        });
        const text = plan.ok
          ? [
              "NOT RUN. Nothing was invoked. Review, then run it yourself in the right account:",
              `  ${plan.dryRunCommand}   # permission and parameter check only`,
              `  ${plan.command}   # real invocation`,
              "",
              "Before you do:",
              ...plan.effects.map((e) => `  - ${e}`),
              "  - Confirm the account and region with /aws-context:status, and remove secrets from the payload.",
            ].join("\n")
          : `Cannot prepare the invocation:\n${plan.problems.map((p) => `  - ${p}`).join("\n")}`;
        return {
          exitCode: plan.ok ? 0 : 1,
          stdout: ctx.json ? JSON.stringify(plan, null, 2) : text,
        };
      },
    },
    explain: {
      help: `<topic>  Configuration trade-offs: ${Object.keys(TOPICS).join(", ")}`,
      run: (ctx) => {
        const key = ctx.words[0];
        if (key === undefined)
          return ctx.out(Object.keys(TOPICS), `Topics: ${Object.keys(TOPICS).join(", ")}`);
        const t = Object.hasOwn(TOPICS, key) ? TOPICS[key] : undefined;
        if (t === undefined) return ctx.fail(`unknown topic ${key}`, 2);
        return ctx.out(
          t,
          `${t.title}\n${t.points.map((p) => `- ${p}`).join("\n")}\nSource: ${t.source}`,
        );
      },
    },
  },
});

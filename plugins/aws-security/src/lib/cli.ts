import { isAbsolute, resolve } from "node:path";

import { readTextBounded } from "@claude-code-aws/context-contract/node";

import {
  buildReport,
  type ExecutionContext,
  type Finding,
  renderReport,
} from "@claude-code-aws/report-contract";
import { safeText } from "@claude-code-aws/safe-output";
import { loadStacks } from "@claude-code-aws/template-analysis/node";
import { runRules } from "@claude-code-aws/template-analysis";
import { isInside } from "@claude-code-aws/tool-runner";

import { authMatrix, renderAuth } from "./auth.js";
import { remediation, STRIDE_NOTE, threatModel } from "./threat.js";
import { explainDenied } from "./denied.js";
import { applyExclusions, type Exclusion } from "./exclusions.js";
import { describeStatement, type PolicyKind, policyTemplate, statementsOf } from "./policy.js";
import { SECURITY_RULES } from "./rules.js";

export const PLUGIN = "aws-security";

export const USAGE = `Usage: aws-security <command> [options]

  audit [path]                          Security rules over cdk.out (default) or a template
  iam [path]                            IAM and resource-policy statements and their findings
  iam --policy <file> [--trust|--resource]   The same for one policy document (identity policy by default)
  iam --explain "<AccessDenied message>"     What the message says, and a starting point for a fix
  auth [path]                           Which API routes have an authorizer, JWT settings, CORS
  threat-model [path]                   Entry points, trust boundaries, and candidate attack paths (hypotheses)
  remediate [path]                      Proposed fixes for the audit findings (nothing is applied)

Options: --json

Advisory and read-only: it reads local files and prints. It changes nothing and is not an enforcement boundary; IAM and SCPs are.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

export interface CliDeps {
  root: string;
  context: () => ExecutionContext;
  /** Exclusions already read from the user and project files, and their warnings. */
  exclusions: () => { exclusions: Exclusion[]; warnings: string[] };
  now?: Date;
}

const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const plain = (text: string): string =>
  safeText(text, { maxLines: 500, maxLineLength: 500, maxChars: 80_000 }, { personalData: false })
    .text;

const LIMITATIONS = [
  "Reads the synthesized template only: it cannot see application code, runtime behavior, or what is deployed in the account.",
  "A finding is a fact about the template, not proof that the account is exploitable. Policy conditions that depend on values resolved at deploy time are not evaluated.",
  "Not an enforcement boundary: IAM policies, SCPs, and permission boundaries are.",
];

function readPolicyFile(root: string, path: string): { text: string | null; error: string | null } {
  const target = isAbsolute(path) ? path : resolve(root, path);
  if (!isInside(root, target))
    return { text: null, error: "The policy file is outside the project." };
  // One bounded read on a single file descriptor: no gap between checking the size and reading.
  const read = readTextBounded(target, 1_000_000);
  if (read.kind === "ok") return { text: read.text, error: null };
  return {
    text: null,
    error:
      read.kind === "too-large" ? "The policy file is too large." : `${path} could not be read.`,
  };
}

export function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  return Promise.resolve(run(argv, deps));
}

function run(argv: readonly string[], deps: CliDeps): CliResult {
  const words: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (["json", "trust", "resource"].includes(name)) options.set(name, true);
    else if (["policy", "explain"].includes(name)) {
      const value = argv[i + 1];
      if (value === undefined) return usageError(`--${name} needs a value`);
      options.set(name, value);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = options.has("json");
  const [command, first, second] = words;
  if (second !== undefined) return usageError("too many arguments");
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : plain(text),
  });
  const now = deps.now ?? new Date();
  const configured = deps.exclusions();

  const report = (
    findings: Finding[],
    summaryOf: (count: number) => string,
    extra: string[],
    inputs: number,
  ) => {
    const { kept, suppressed, notes } = applyExclusions(findings, configured.exclusions, now);
    const serious = kept.filter((f) => f.severity === "critical" || f.severity === "high").length;
    return buildReport({
      plugin: PLUGIN,
      context: deps.context(),
      mode: "local",
      summary:
        inputs === 0
          ? "No templates were read, so nothing was audited."
          : `${summaryOf(kept.length)}${serious === 0 ? "" : ` ${serious} high or critical.`}`,
      findings: kept,
      limitations: [
        ...LIMITATIONS,
        ...extra,
        ...configured.warnings,
        ...notes,
        ...suppressed.map(
          ({ finding, exclusion }) =>
            `Hidden by your ${exclusion.source} exclusion: ${finding.ruleId} on ${finding.affectedResources?.[0] ?? "*"} (${exclusion.reason}${exclusion.expires === null ? "" : `; expires ${exclusion.expires}`}).`,
        ),
      ],
      suppressed: suppressed.length,
      now,
    });
  };

  switch (command) {
    case "audit": {
      const loaded = loadStacks(deps.root, first ?? "cdk.out");
      const { findings } = runRules(
        PLUGIN,
        SECURITY_RULES,
        loaded.stacks.map((s) => ({ name: s.name, template: s.template })),
        { now },
      );
      const result = report(
        findings,
        (n) => `${n} security finding(s) in ${loaded.stacks.length} stack(s).`,
        loaded.problems,
        loaded.stacks.length,
      );
      return print(result, renderReport(result));
    }

    case "iam": {
      const explain = options.get("explain");
      if (typeof explain === "string") {
        const result = explainDenied(explain);
        const text = [
          result.parsed
            ? `Principal: ${result.principal ?? "?"}\nAction:    ${result.action ?? "?"}\nResource:  ${result.resource ?? "(not named)"}\n`
            : "",
          `Cause: ${result.cause}`,
          result.explanation,
          "",
          "What to check:",
          ...result.checks.map((check) => `  - ${check}`),
          ...(result.proposal === null
            ? []
            : [
                "",
                "A starting point for the missing statement (a proposal, not a fix):",
                JSON.stringify(result.proposal, null, 2),
              ]),
          "",
          ...result.caveats,
        ].join("\n");
        return print(result, text);
      }
      const policy = options.get("policy");
      let templates;
      const problems: string[] = [];
      if (typeof policy === "string") {
        const read = readPolicyFile(deps.root, policy);
        if (read.text === null) return print({ error: read.error }, read.error ?? "");
        const kind: PolicyKind = options.has("trust")
          ? "trust"
          : options.has("resource")
            ? "resource"
            : "identity";
        const built = policyTemplate(read.text, kind);
        if (built.template === null) return print({ error: built.error }, built.error ?? "");
        templates = [{ name: policy, template: built.template }];
      } else {
        const loaded = loadStacks(deps.root, first ?? "cdk.out");
        problems.push(...loaded.problems);
        templates = loaded.stacks.map((s) => ({ name: s.name, template: s.template }));
      }
      const iamRules = SECURITY_RULES.filter(
        (rule) => rule.id.startsWith("SEC-IAM-") || rule.id.startsWith("SEC-RES-"),
      );
      const { findings } = runRules(PLUGIN, iamRules, templates, { now });
      const result = report(
        findings,
        (n) => `${n} IAM or resource-policy finding(s).`,
        problems,
        templates.length,
      );
      const statements = templates.flatMap((t) =>
        statementsOf(t.template).map((s) => `  [${s.kind}] ${s.owner}: ${describeStatement(s)}`),
      );
      return print(
        { report: result, statements: statements.length },
        `${statements.length} statement(s):\n${statements.join("\n")}\n\n${renderReport(result)}`,
      );
    }

    case "auth": {
      const loaded = loadStacks(deps.root, first ?? "cdk.out");
      const matrices = loaded.stacks.map((stack) => ({
        stack: stack.name,
        matrix: authMatrix(stack.template),
      }));
      const authRules = SECURITY_RULES.filter((rule) => rule.id.startsWith("SEC-APIGW-"));
      const { findings } = runRules(
        PLUGIN,
        authRules,
        loaded.stacks.map((s) => ({ name: s.name, template: s.template })),
        { now },
      );
      const result = report(
        findings,
        (n) => `${n} API authorization finding(s).`,
        loaded.problems,
        loaded.stacks.length,
      );
      const text = [
        ...matrices.map((m) => `Stack ${m.stack}\n${renderAuth(m.matrix)}`),
        "",
        renderReport(result),
      ].join("\n\n");
      return print({ matrices, report: result }, text);
    }

    case "threat-model": {
      const loaded = loadStacks(deps.root, first ?? "cdk.out");
      const model = threatModel(loaded.stacks.map((s) => ({ name: s.name, template: s.template })));
      const result = report(
        model.findings,
        (n) =>
          `${n} candidate threat(s) from ${model.entryPoints.length} entry point(s) in ${loaded.stacks.length} stack(s). All are hypotheses.`,
        [...loaded.problems, STRIDE_NOTE],
        loaded.stacks.length,
      );
      const text = [
        `Trust boundaries: ${model.boundaries.join(", ")}`,
        "Entry points:",
        ...model.entryPoints.map(
          (e) => `  ${e.kind} ${e.id}: ${e.unauthenticatedRoutes} route(s) without authorization`,
        ),
        `Candidate attack paths (${model.paths.length}): ${
          model.paths
            .slice(0, 15)
            .map((p) => `${p.entry} -> ${p.via.join(" -> ") || "(direct)"} -> ${p.reaches}`)
            .join("; ") || "none"
        }`,
        "",
        renderReport(result),
      ].join("\n");
      return print(
        {
          model: {
            boundaries: model.boundaries,
            entryPoints: model.entryPoints,
            paths: model.paths,
          },
          report: result,
        },
        text,
      );
    }

    case "remediate": {
      const loaded = loadStacks(deps.root, first ?? "cdk.out");
      const { findings } = runRules(
        PLUGIN,
        SECURITY_RULES,
        loaded.stacks.map((s) => ({ name: s.name, template: s.template })),
        { now },
      );
      const { kept } = applyExclusions(findings, configured.exclusions, now);
      const proposals = kept.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        resource: f.affectedResources?.[0] ?? "*",
        ...remediation(f.ruleId, f.recommendation),
      }));
      const text = [
        proposals.length === 0
          ? "No findings, so nothing to remediate."
          : `${proposals.length} proposal(s). NOTHING WAS CHANGED: apply a fix in code, run the tests, and deploy through /aws-deploy.`,
        ...proposals.map(
          (p) =>
            `[${p.severity}] ${p.ruleId} on ${p.resource}\n    Change: ${p.change}\n    Verify: ${p.verify}`,
        ),
        ...loaded.problems,
      ].join("\n");
      return print({ proposals }, text);
    }

    default:
      return { exitCode: 2, stdout: USAGE };
  }
}

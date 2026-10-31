import {
  buildReport,
  type ExecutionContext,
  LOCAL_CONTEXT,
  renderDiff,
  renderReport,
} from "@claude-code-aws/report-contract";
import { isValidRegion } from "@claude-code-aws/context-contract";
import { parseTemplate } from "@claude-code-aws/template-analysis";
import { runRules } from "@claude-code-aws/template-analysis";
import { safeText } from "@claude-code-aws/safe-output";

import { compareStacks, diffFindings, diffReport } from "./compare.js";
import { classifyAwsFailure } from "./failures.js";
import { type DeployedApi } from "./deployed.js";
import { inspectStacks, renderInspect } from "./inspect.js";
import { type LoadedStack, loadStacks } from "@claude-code-aws/template-analysis/node";
import { IAC_QUALITY_RULES } from "./rules.js";
import { PATTERNS, planScaffold, writeScaffold } from "./scaffold.js";
import { type Runner, synth } from "./synth.js";

export const USAGE = `Usage: aws-infrastructure <command> [options]

  inspect [path]                       Inventory, graph, and stateful resources of cdk.out (default) or a template
  synth [--out dir] [--lookups]        Run cdk synth safely (no AWS credentials unless --lookups), then inspect
  diff <baseline> [candidate]          Compare two cdk.out directories or templates (candidate defaults to cdk.out)
  diff --deployed <stack> [candidate]  Compare the template CloudFormation has for a stack with the candidate
  review [path]                        Operational-quality rules over the templates
  scaffold <pattern> <Name> [--write]  Generate CDK TypeScript (${PATTERNS.join(", ")}); lists files unless --write

Options: --json   --region <region> (with --deployed)   --stack <name> (synth, repeatable)

Nothing here deploys or changes AWS. diff compares templates only; a change set needs your approval.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

export interface CliDeps {
  root: string;
  env: Record<string, string | undefined>;
  /** The aws-context interpretation, as an execution context. */
  context: () => ExecutionContext;
  /** The account aws-context last verified, to adopt its environment classification. */
  contextEnvironment: () => {
    accountId: string;
    environment: ExecutionContext["environment"];
    profile: string | null;
  } | null;
  sdkRegion: () => Promise<string | null>;
  fallbackRegion: string | null;
  deployedApi: (region: string) => DeployedApi;
  run?: Runner;
  now?: Date;
}

interface Parsed {
  words: string[];
  options: Map<string, string | true>;
  stacks: string[];
  bad: string | null;
}

const VALUE_OPTIONS = new Set(["out", "region", "deployed", "stack", "method"]);

function parse(argv: readonly string[]): Parsed {
  const parsed: Parsed = { words: [], options: new Map(), stacks: [], bad: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      parsed.words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (["json", "lookups", "write"].includes(name)) parsed.options.set(name, true);
    else if (VALUE_OPTIONS.has(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) parsed.bad = `--${name} needs a value`;
      else {
        i += 1;
        if (name === "stack") parsed.stacks.push(value);
        else parsed.options.set(name, value);
      }
    } else parsed.bad = `unknown option --${name}`;
  }
  return parsed;
}

const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const plain = (text: string): string =>
  safeText(text, { maxLines: 400, maxLineLength: 400, maxChars: 60_000 }, { personalData: false })
    .text;

function problemsBlock(problems: readonly string[]): string {
  return problems.length === 0
    ? ""
    : `\n${problems.map((problem) => `Problem: ${problem}`).join("\n")}`;
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  const parsed = parse(argv);
  if (parsed.bad !== null) return usageError(parsed.bad);
  const json = parsed.options.has("json");
  const [command, first, second, ...rest] = parsed.words;
  if (rest.length > 0) return usageError("too many arguments");
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text,
  });
  const now = deps.now ?? new Date();

  switch (command) {
    case "inspect": {
      if (second !== undefined) return usageError("too many arguments");
      const loaded = loadStacks(deps.root, first ?? "cdk.out");
      const result = inspectStacks(loaded.stacks, loaded.problems);
      return print(result, plain(renderInspect(result)));
    }

    case "synth": {
      if (first !== undefined) return usageError("synth takes no positional argument");
      const out = parsed.options.get("out");
      const result = await synth({
        root: deps.root,
        env: deps.env,
        ...(typeof out === "string" ? { out } : {}),
        stacks: parsed.stacks,
        lookups: parsed.options.has("lookups"),
        ...(deps.run === undefined ? {} : { run: deps.run }),
      });
      if (!result.ok || result.outDir === null) {
        const d = result.diagnostic;
        const text = [
          `Synth failed: ${d?.code ?? "UNKNOWN"}`,
          d?.message ?? "",
          `Next: ${d?.hint ?? ""}`,
          ...(d !== null && d.excerpt.length > 0
            ? ["", "Output (redacted, first lines):", ...d.excerpt.map((line) => `  ${line}`)]
            : []),
        ].join("\n");
        return print(result, plain(text));
      }
      const loaded = loadStacks(
        deps.root,
        parsed.options.get("out") === undefined ? "cdk.out" : String(parsed.options.get("out")),
      );
      const inspection = inspectStacks(loaded.stacks, loaded.problems);
      const header = `Synthesized in ${Math.round(result.durationMs / 100) / 10}s ${result.lookups ? "with your AWS credentials (lookups allowed)" : "without AWS credentials (no lookups)"}.\n\n`;
      return print({ synth: result, inspection }, plain(header + renderInspect(inspection)));
    }

    case "review": {
      if (second !== undefined) return usageError("too many arguments");
      const loaded = loadStacks(deps.root, first ?? "cdk.out");
      const { findings } = runRules(
        "aws-infrastructure",
        IAC_QUALITY_RULES,
        loaded.stacks.map((s) => ({ name: s.name, template: s.template })),
        { now },
      );
      const high = findings.filter(
        (f) => f.severity === "high" || f.severity === "critical",
      ).length;
      const report = buildReport({
        plugin: "aws-infrastructure",
        context: deps.context(),
        mode: "local",
        summary:
          loaded.stacks.length === 0
            ? "No templates were read, so nothing was reviewed."
            : `${findings.length} finding(s) in ${loaded.stacks.length} stack(s)${high === 0 ? "." : `, ${high} high.`}`,
        findings,
        limitations: [
          "Reviews the synthesized template only: it cannot see application code, runtime behavior, or the deployed account.",
          "The runtime check uses a dated snapshot of the Lambda runtime table.",
          ...loaded.problems,
        ],
        now,
      });
      return print(report, plain(renderReport(report)));
    }

    case "diff": {
      const deployedStack = parsed.options.get("deployed");
      if (
        parsed.options.get("method") !== undefined &&
        parsed.options.get("method") !== "template"
      ) {
        return usageError(
          "Only --method template is available here. A change-set diff creates and deletes a change set in your account, so run it yourself: `cdk diff --method=change-set <stack>` (aws-guard will ask for your approval).",
        );
      }
      let baseline: LoadedStack[];
      let context = deps.context();
      let mode: "local" | "read-only-cloud" = "local";
      let baselineLabel: string;
      let candidatePath: string | undefined;
      const problems: string[] = [];
      if (typeof deployedStack === "string") {
        if (first !== undefined && second !== undefined)
          return usageError("with --deployed, give at most the candidate path");
        candidatePath = first;
        const regionOption = parsed.options.get("region");
        if (
          regionOption !== undefined &&
          (typeof regionOption !== "string" || !isValidRegion(regionOption))
        ) {
          return usageError("--region is not a valid region name");
        }
        const region =
          typeof regionOption === "string"
            ? regionOption
            : ((await deps.sdkRegion()) ?? deps.fallbackRegion);
        if (region === null) {
          return print(
            { error: "NO_REGION" },
            "No region is set. Pass --region <region>, or set AWS_REGION or a profile region.",
          );
        }
        const api = deps.deployedApi(region);
        try {
          const identity = await api.identity();
          const known = deps.contextEnvironment();
          context = {
            accountId: identity.accountId,
            region,
            profile: known?.accountId === identity.accountId ? known.profile : null,
            identityVerified: true,
            environment: known?.accountId === identity.accountId ? known.environment : "unknown",
          };
          const body = await api.getTemplate(deployedStack);
          const template = parseTemplate(body);
          if (!template.ok) {
            return print(
              { error: "DEPLOYED_TEMPLATE_UNREADABLE" },
              `The deployed template of ${deployedStack} could not be read: ${template.error}.`,
            );
          }
          baseline = [
            { name: deployedStack, file: `deployed:${deployedStack}`, template: template.template },
          ];
          mode = "read-only-cloud";
          baselineLabel = `deployed template of ${deployedStack} (account ${identity.accountId}, ${region})`;
        } catch (error) {
          const failure = classifyAwsFailure(error);
          return print(
            { error: failure.code },
            `${failure.message}${failure.action === undefined ? "" : `\nMissing permission: ${failure.action}`}`,
          );
        } finally {
          api.close();
        }
      } else {
        if (first === undefined)
          return usageError(
            "give the baseline: a cdk.out directory or a template, or use --deployed <stack>",
          );
        candidatePath = second;
        const loadedBase = loadStacks(deps.root, first);
        problems.push(...loadedBase.problems);
        baseline = loadedBase.stacks;
        baselineLabel = first;
      }
      const loadedCandidate = loadStacks(deps.root, candidatePath ?? "cdk.out");
      problems.push(...loadedCandidate.problems);
      let candidate = loadedCandidate.stacks;
      if (typeof deployedStack === "string" && candidate.length > 1) {
        const match = candidate.filter((stack) => stack.name === deployedStack);
        if (match.length === 0)
          return usageError(
            `${deployedStack} is not one of the candidate stacks: ${candidate.map((s) => s.name).join(", ")}`,
          );
        candidate = match;
      }
      if (baseline.length === 0 || candidate.length === 0) {
        return print(
          { error: "NO_TEMPLATES", problems },
          plain(`Nothing to compare.${problemsBlock(problems)}`),
        );
      }
      const { diff } = compareStacks({
        baseline,
        candidate,
        baselineLabel,
        candidateLabel: candidatePath ?? "cdk.out",
        context,
        now,
      });
      const findings = diffFindings(diff.changes);
      const report = diffReport(diff, findings);
      const finalReport = mode === "read-only-cloud" ? { ...report, mode } : report;
      return print(
        { diff, report: finalReport },
        plain(`${renderDiff(diff)}\n\n${renderReport(finalReport)}${problemsBlock(problems)}`),
      );
    }

    case "scaffold": {
      if (first === undefined || second === undefined)
        return usageError("use: scaffold <pattern> <Name>");
      const plan = planScaffold(first, second);
      if ("error" in plan) return usageError(plan.error);
      if (!parsed.options.has("write")) {
        const text = [
          `Pattern ${plan.pattern} for ${second}. These files would be created (nothing was written; add --write):`,
          ...plan.files.map(
            (file) => `  ${file.path} (${file.content.split("\n").length - 1} lines)`,
          ),
          "",
          `Next: add to your CDK app: new ${second}Stack(app, "${second}")`,
          "Requires aws-cdk-lib, constructs, and Vitest in the project. Existing files are never overwritten.",
        ].join("\n");
        return print(
          { pattern: plan.pattern, written: false, files: plan.files.map((f) => f.path) },
          text,
        );
      }
      const outcome = writeScaffold(deps.root, plan.files);
      const text = [
        ...outcome.written.map((file) => `Created ${file}`),
        ...outcome.skipped.map((file) => `Skipped ${file} (it exists or is outside the project)`),
        "",
        `Next: add to your CDK app: new ${second}Stack(app, "${second}"), then run synth.`,
      ].join("\n");
      return print({ pattern: plan.pattern, ...outcome }, text);
    }

    default:
      return { exitCode: 2, stdout: USAGE };
  }
}

export { LOCAL_CONTEXT };

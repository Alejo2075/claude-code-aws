import { isValidRegion } from "@claude-code-aws/context-contract";
import { safeText } from "@claude-code-aws/safe-output";
import { inventory, parseTemplate } from "@claude-code-aws/template-analysis";
import {
  loadStacks,
  type Runner as SynthRunner,
  synth,
} from "@claude-code-aws/template-analysis/node";
import { isInside } from "@claude-code-aws/tool-runner";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { DeployApi } from "./aws.js";
import { executeDeploy, type Runner as ExecRunner } from "./execute.js";
import { pipelineFiles, type PipelineInput, validatePipeline } from "./pipeline.js";
import {
  confirmationFor,
  gateProblems,
  loadPlan,
  prunePlans,
  savePlan,
  templateHash,
} from "./plan.js";
import { type Check, preflight } from "./preflight.js";
import { adviseRollback } from "./rollback.js";

export const USAGE = `Usage: aws-deploy <command> [options]

  preflight [--stack <name>]...             Review the app against the account. Changes nothing.
  plan [--stack <name>]...                  Preflight, then save a one-hour plan bound to the account, region, and template hashes
  deploy <plan id> [--confirm <text>] [--accept-destructive <id,...>] [--accept-security-changes]
                                            Deploy exactly the reviewed templates. Needs a valid plan.
  status <stack>                            Stack status and recent events (read-only)
  rollback <stack>                          What can and cannot be undone, with commands for you to run (executes nothing)
  pipeline --account <id> --region <r> --repo <owner/name> --environment <name> [--branch main] [--qualifier hnb659fds] [--write]
                                            GitHub Actions with OIDC and a least-privilege role

Options: --region <region>   --json

Deployment uses your own AWS credentials, never uses hotswap, and refuses when anything differs from the plan.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

export interface CliDeps {
  root: string;
  env: Record<string, string | undefined>;
  configDir: string | null;
  workspaceId: string;
  api: (region: string) => DeployApi;
  sdkRegion: () => Promise<string | null>;
  fallbackRegion: string | null;
  known: () => {
    accountId: string;
    environment: "production" | "non-production" | "unknown";
  } | null;
  synthRun?: SynthRunner;
  execRun?: ExecRunner;
  now?: Date;
}

const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const plain = (text: string): string =>
  safeText(text, { maxLines: 400, maxLineLength: 400, maxChars: 80_000 }, { personalData: false })
    .text;
const MARK = { pass: "✔", warn: "!", fail: "✖", skipped: "-" } as const;
const checkLines = (checks: readonly Check[]): string[] =>
  checks.map((check) => `  ${MARK[check.status]} ${check.name}: ${check.detail}`);

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  const words: string[] = [];
  const options = new Map<string, string | true>();
  const stacks: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (["json", "write", "accept-security-changes"].includes(name)) options.set(name, true);
    else if (
      [
        "region",
        "confirm",
        "accept-destructive",
        "stack",
        "account",
        "repo",
        "environment",
        "branch",
        "qualifier",
      ].includes(name)
    ) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--"))
        return usageError(`--${name} needs a value`);
      i += 1;
      if (name === "stack") stacks.push(value);
      else options.set(name, value);
    } else return usageError(`unknown option --${name}`);
  }
  const json = options.has("json");
  const [command, target, extra] = words;
  if (extra !== undefined) return usageError("too many arguments");
  const print = (value: unknown, text: string, exitCode = 0): CliResult => ({
    exitCode,
    stdout: json ? JSON.stringify(value, null, 2) : plain(text),
  });
  const now = deps.now ?? new Date();

  if (command === "pipeline") {
    const input: PipelineInput = {
      account: String(options.get("account") ?? ""),
      region: String(options.get("region") ?? ""),
      repo: String(options.get("repo") ?? ""),
      environment: String(options.get("environment") ?? ""),
      branch: String(options.get("branch") ?? "main"),
      qualifier: String(options.get("qualifier") ?? "hnb659fds"),
    };
    const problem = validatePipeline(input);
    if (problem !== null) return usageError(problem);
    const files = pipelineFiles(input);
    if (!options.has("write")) {
      // Generated text with validated inputs and no secrets: shown as is, so `id-token: write` is not mistaken for a secret.
      const text = [
        "These files would be created (add --write); nothing was written:",
        ...files.map((f) => `  ${f.path}`),
        "",
        files[0]?.content ?? "",
      ].join("\n");
      return {
        exitCode: 0,
        stdout: json
          ? JSON.stringify({ written: false, files: files.map((f) => f.path) }, null, 2)
          : text,
      };
    }
    const done: string[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      const path = resolve(deps.root, file.path);
      if (!isInside(deps.root, path)) {
        skipped.push(file.path);
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      try {
        writeFileSync(path, file.content, { flag: "wx" });
        done.push(file.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        skipped.push(file.path);
      }
    }
    return print(
      { written: done, skipped },
      [
        ...done.map((f) => `Created ${f}`),
        ...skipped.map((f) => `Skipped ${f} (it exists or is outside the project)`),
        "",
        "Next: create the IAM OIDC provider and the role github-cdk-deploy with iam/github-oidc-trust.json and iam/github-deploy-policy.json, and add required reviewers to the GitHub environment.",
      ].join("\n"),
    );
  }

  if (!["preflight", "plan", "deploy", "status", "rollback"].includes(command ?? ""))
    return { exitCode: 2, stdout: USAGE };
  if (
    (command === "deploy" || command === "status" || command === "rollback") &&
    target === undefined
  )
    return usageError(`${command} needs ${command === "deploy" ? "a plan id" : "a stack name"}`);
  if ((command === "preflight" || command === "plan") && target !== undefined)
    return usageError(`${command} takes no argument; use --stack <name>`);

  let planned = null as ReturnType<typeof loadPlan> | null;
  if (command === "deploy") {
    if (deps.configDir === null)
      return print(
        { error: "NO_CONFIG_DIR" },
        "The Claude config directory could not be found, so plans cannot be read.",
        1,
      );
    planned = loadPlan(deps.configDir, deps.workspaceId, target ?? "", now);
    if (!planned.ok)
      return print(
        { deployed: false, reason: planned.reason },
        `Not deployed. ${planned.reason}`,
        1,
      );
  }
  const regionOption = options.get("region");
  if (
    regionOption !== undefined &&
    (typeof regionOption !== "string" || !isValidRegion(regionOption))
  )
    return usageError("--region is not a valid region name");
  const region =
    planned?.ok === true
      ? planned.plan.region
      : typeof regionOption === "string"
        ? regionOption
        : ((await deps.sdkRegion()) ?? deps.fallbackRegion);
  if (
    planned?.ok === true &&
    typeof regionOption === "string" &&
    regionOption !== planned.plan.region
  ) {
    return print(
      { deployed: false },
      `Not deployed. --region ${regionOption} is not the planned region (${planned.plan.region}).`,
      1,
    );
  }
  if (region === null)
    return print(
      { error: "NO_REGION" },
      "No region is set. Pass --region <region>, or set AWS_REGION or a profile region.",
    );
  const api = deps.api(region);
  try {
    switch (command) {
      case "preflight":
      case "plan": {
        const outcome = await preflight({
          root: deps.root,
          env: deps.env,
          api,
          region,
          workspaceId: deps.workspaceId,
          known: deps.known(),
          stacks,
          now,
          ...(deps.synthRun === undefined ? {} : { run: deps.synthRun }),
        });
        const lines = ["Preflight (read-only):", ...checkLines(outcome.checks)];
        if (outcome.blocked || outcome.plan === null) {
          return print(
            { blocked: true, checks: outcome.checks },
            [...lines, "", "Blocked: fix the failed check(s); no plan was made."].join("\n"),
          );
        }
        if (command === "preflight")
          return print(
            { blocked: false, checks: outcome.checks, plan: outcome.plan },
            [...lines, "", "No plan was saved. Run `plan` to save one."].join("\n"),
          );
        if (deps.configDir === null)
          return print(
            { error: "NO_CONFIG_DIR" },
            "The Claude config directory could not be found, so the plan cannot be saved.",
            1,
          );
        prunePlans(deps.configDir, deps.workspaceId, now);
        savePlan(deps.configDir, outcome.plan);
        const p = outcome.plan;
        const needs = [
          p.environment !== "non-production" ? `--confirm ${confirmationFor(p)}` : null,
          p.destructive.length > 0
            ? `--accept-destructive ${p.destructive.map((d) => d.logicalId).join(",")}`
            : null,
          p.broadening.length > 0 ? "--accept-security-changes" : null,
        ].filter((part): part is string => part !== null);
        return print(
          { blocked: false, checks: outcome.checks, plan: p },
          [
            ...lines,
            "",
            `Plan ${p.id} saved. It is valid until ${p.expiresAt} and covers: ${p.stacks.map((s) => s.name).join(", ")} in ${p.accountId} ${p.region} (${p.environment}).`,
            `To deploy exactly this: /aws-deploy:deploy ${p.id}${needs.length === 0 ? "" : ` ${needs.join(" ")}`}`,
            "Nothing has been deployed.",
          ].join("\n"),
        );
      }

      case "deploy": {
        if (planned?.ok !== true) return usageError("no plan");
        const plan = planned.plan;
        let identityAccount: string;
        try {
          identityAccount = (await api.identity()).accountId;
        } catch {
          return print(
            { deployed: false },
            "Not deployed. The AWS identity could not be verified. Sign in yourself and retry.",
            1,
          );
        }
        const built = await synth({
          root: deps.root,
          env: deps.env,
          stacks: plan.stacks.map((s) => s.name),
          ...(deps.synthRun === undefined ? {} : { run: deps.synthRun }),
        });
        if (!built.ok)
          return print(
            { deployed: false, diagnostic: built.diagnostic },
            `Not deployed. Synthesis failed: ${built.diagnostic?.code ?? "unknown"} ${built.diagnostic?.hint ?? ""}`,
            1,
          );
        const loaded = loadStacks(deps.root, "cdk.out");
        const current = new Map(
          loaded.stacks
            .filter((s) => plan.stacks.some((p) => p.name === s.name))
            .map((s) => [s.name, templateHash(s.template)]),
        );
        const problems = gateProblems({
          plan,
          identity: { accountId: identityAccount },
          region,
          currentHashes: current,
          confirm:
            typeof options.get("confirm") === "string" ? String(options.get("confirm")) : null,
          acceptDestructive: String(options.get("accept-destructive") ?? "")
            .split(",")
            .filter((id) => id !== ""),
          acceptSecurityChanges: options.has("accept-security-changes"),
        });
        if (problems.length > 0)
          return print(
            { deployed: false, problems },
            [
              "Not deployed. These must be resolved first:",
              ...problems.map((p) => `  - ${p}`),
            ].join("\n"),
            1,
          );
        const result = await executeDeploy({
          root: deps.root,
          env: deps.env,
          stacks: plan.stacks.map((s) => s.name),
          ...(deps.execRun === undefined ? {} : { run: deps.execRun }),
        });
        if (!result.started)
          return print(
            { deployed: false, problem: result.problem },
            `Not deployed. ${result.problem ?? ""}`,
            1,
          );
        const after: string[] = [];
        let allGood = result.exitCode === 0 && !result.timedOut;
        for (const stack of plan.stacks) {
          try {
            const state = await api.describeStack(stack.name);
            after.push(
              `  ${stack.name}: ${state?.status ?? "not found"}${state?.reason ? ` (${state.reason})` : ""}`,
            );
            if (state === null || !/^(CREATE|UPDATE)_COMPLETE$/.test(state.status)) allGood = false;
          } catch {
            after.push(`  ${stack.name}: status could not be read`);
            allGood = false;
          }
        }
        const lines = [
          allGood ? "Deployed." : "The deployment did not complete cleanly.",
          ...after,
          "",
          "Output (redacted, last lines):",
          ...result.excerpt.map((line) => `  ${line}`),
          ...(result.timedOut
            ? ["", "It hit the time limit; check the stack status before doing anything else."]
            : []),
          ...(allGood
            ? []
            : [
                "",
                "CloudFormation rolls back failed updates by itself. Read the events with `status` and `rollback`.",
              ]),
        ];
        return print(
          { deployed: allGood, exitCode: result.exitCode, stacks: after },
          lines.join("\n"),
          allGood ? 0 : 1,
        );
      }

      case "status": {
        const state = await api.describeStack(target ?? "");
        if (state === null)
          return print(
            { found: false },
            `Stack ${target ?? ""} does not exist in this account and region.`,
          );
        const events = await api.events(state.name, 15);
        return print(
          { state, events },
          [
            `${state.name}: ${state.status}${state.reason === null ? "" : ` (${state.reason})`}${state.terminationProtection === true ? "; termination protection on" : ""}`,
            "",
            "Recent events (newest first):",
            ...events.map(
              (e) =>
                `  ${e.at ?? "-"}  ${e.logicalId ?? "-"}  ${/FAILED/.test(e.status ?? "") ? "! " : ""}${e.status ?? "-"}${e.reason === null ? "" : `  ${e.reason}`}`,
            ),
          ].join("\n"),
        );
      }

      case "rollback": {
        const state = await api.describeStack(target ?? "");
        if (state === null)
          return print(
            { found: false },
            `Stack ${target ?? ""} does not exist in this account and region.`,
          );
        const body = await api.getTemplate(state.name);
        const parsed = body === null ? null : parseTemplate(body);
        const stateful =
          parsed?.ok === true
            ? inventory(parsed.template).stateful.map((s) => ({
                logicalId: s.logicalId,
                type: s.type,
                reason: s.reason,
              }))
            : [];
        const advice = adviseRollback(state.name, state.status, state.reason, stateful);
        return print(
          advice,
          [
            advice.summary,
            "",
            "Options:",
            ...advice.options.map((o) => `  - ${o}`),
            ...(advice.commandsForYou.length === 0
              ? []
              : [
                  "",
                  "Commands for you to run (this plugin does not run them):",
                  ...advice.commandsForYou.map((c) => `  ${c}`),
                ]),
            ...(advice.irreversible.length === 0
              ? []
              : [
                  "",
                  "Not reversible by redeploying:",
                  ...advice.irreversible.map((i) => `  - ${i}`),
                ]),
          ].join("\n"),
        );
      }
    }
    return { exitCode: 2, stdout: USAGE };
  } catch {
    return print(
      { error: "AWS_CALL_FAILED" },
      "An AWS call failed (credentials, permissions, or connectivity). Check that you are signed in and allowed to read CloudFormation, then retry.",
      1,
    );
  } finally {
    api.close();
  }
}

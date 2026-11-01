// Integration tests that use real AWS credentials, against an account you name. The command never
// decides that an account is safe to test in: it checks that the verified account is the one you
// named, refuses a production classification, and needs an explicit statement that the account is a
// sandbox. The test command itself runs with the credentials, so it can do whatever they allow:
// use a sandbox account and a role with only the permissions the tests need.
import { type RunResult, runTool, scrubbedEnv } from "@claude-code-aws/tool-runner";
import { safeText } from "@claude-code-aws/safe-output";

import type { Runner } from "./runner.js";

export interface IntegrationDeps {
  root: string;
  env: Record<string, string | undefined>;
  identity: () => Promise<{ accountId: string; arn: string }>;
  known: () => {
    accountId: string;
    environment: "production" | "non-production" | "unknown";
  } | null;
  run?: Runner;
}

export interface IntegrationArgs {
  account: string;
  region: string;
  confirmSandbox: boolean;
  timeoutSeconds: number;
  command: string[];
}

const ACCOUNT = /^\d{12}$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
export const MAX_TIMEOUT = 900;

export function parseIntegration(
  argv: readonly string[],
): { ok: true; args: IntegrationArgs } | { ok: false; error: string } {
  const at = argv.indexOf("--");
  const head = at < 0 ? argv : argv.slice(0, at);
  const command = at < 0 ? [] : argv.slice(at + 1);
  let account = "";
  let region = "";
  let confirm = false;
  let timeout = 300;
  for (let i = 0; i < head.length; i += 1) {
    const a = head[i] ?? "";
    if (a === "--confirm-sandbox") confirm = true;
    else if (a === "--account" || a === "--region" || a === "--timeout") {
      const v = head[i + 1];
      if (v === undefined) return { ok: false, error: `${a} needs a value` };
      if (a === "--account") account = v;
      else if (a === "--region") region = v;
      else timeout = Number(v);
      i += 1;
    } else if (a !== "integration" && !a.startsWith("--json"))
      return { ok: false, error: `unexpected argument ${a}` };
  }
  if (!ACCOUNT.test(account))
    return {
      ok: false,
      error: "--account must be the 12-digit id of the account you mean to test in",
    };
  if (!REGION.test(region))
    return { ok: false, error: "--region must be a valid region such as us-east-1" };
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT)
    return { ok: false, error: `--timeout must be 1 to ${MAX_TIMEOUT} seconds` };
  if (command.length === 0)
    return {
      ok: false,
      error: "give the test command after --, for example: -- npx vitest run tests/integration",
    };
  if (command.some((c) => c.length > 500 || c.includes("\u0000")))
    return { ok: false, error: "the command contains an invalid argument" };
  return {
    ok: true,
    args: { account, region, confirmSandbox: confirm, timeoutSeconds: timeout, command },
  };
}

export type IntegrationOutcome =
  | { ran: false; reason: string }
  | {
      ran: true;
      exitCode: number | null;
      timedOut: boolean;
      durationMs: number;
      account: string;
      region: string;
      output: string[];
      truncated: boolean;
    };

export async function runIntegration(
  args: IntegrationArgs,
  deps: IntegrationDeps,
): Promise<IntegrationOutcome> {
  let identity: { accountId: string; arn: string };
  try {
    identity = await deps.identity();
  } catch {
    return {
      ran: false,
      reason:
        "The AWS identity could not be verified with STS, so nothing was run. Fix your credentials first (aws-context status).",
    };
  }
  if (identity.accountId !== args.account)
    return {
      ran: false,
      reason: `The active credentials belong to a different account than the one you named (${args.account}). Nothing was run: switch to the right profile and try again.`,
    };
  const known = deps.known();
  if (
    known !== null &&
    known.accountId === identity.accountId &&
    known.environment === "production"
  )
    return {
      ran: false,
      reason:
        "This account is classified as production in your aws-context configuration. Integration tests with real credentials are not run against production.",
    };
  if (!args.confirmSandbox)
    return {
      ran: false,
      reason: `NOT RUN. The tests would run with the credentials of ${identity.arn} in account ${args.account}, region ${args.region}, and can do whatever those credentials allow (create, change, delete, cost money). Run again with --confirm-sandbox only if this account is a sandbox and the credentials are limited to what the tests need.`,
    };
  const env = scrubbedEnv(deps.env, { allowAws: true });
  // An endpoint override would send the signed requests somewhere else.
  delete env["AWS_ENDPOINT_URL"];
  env["AWS_REGION"] = args.region;
  env["AWS_DEFAULT_REGION"] = args.region;
  env["CI"] = "1";
  const [command, ...rest] = args.command;
  const result: RunResult = await (deps.run ?? runTool)({
    command: command ?? "",
    args: rest,
    root: deps.root,
    env,
    timeoutMs: args.timeoutSeconds * 1000,
    maxOutputBytes: 200_000,
  });
  if (result.spawnError !== null)
    return { ran: false, reason: `The test command could not be started (${result.spawnError}).` };
  const safe = safeText(
    `${result.stdout}\n${result.stderr}`,
    { maxLines: 120, maxLineLength: 300, maxChars: 20_000 },
    { personalData: false },
  );
  return {
    ran: true,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    account: args.account,
    region: args.region,
    output: safe.text.split("\n"),
    truncated: safe.cut || result.stdoutTruncated || result.stderrTruncated,
  };
}

export function renderIntegration(o: IntegrationOutcome): string {
  if (!o.ran) return o.reason;
  return [
    `Integration tests ${o.timedOut ? "TIMED OUT" : o.exitCode === 0 ? "PASSED" : `FAILED (exit ${String(o.exitCode)})`} in ${(o.durationMs / 1000).toFixed(1)}s against account ${o.account.slice(0, 4)}…${o.account.slice(-4)}, region ${o.region}.`,
    "Source: a real run with real credentials (not a fixture or a simulation).",
    "",
    "Output (redacted, bounded):",
    ...o.output.map((l) => `  ${l}`),
    ...(o.truncated ? ["  ... output was cut"] : []),
    "",
    "Resources the tests created are not tracked or cleaned up here. Check the account (aws-explorer) and remove leftovers with the tool that made them.",
  ].join("\n");
}

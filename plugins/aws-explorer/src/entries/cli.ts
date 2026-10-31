import { resolveSdkRegion } from "@claude-code-aws/aws-client";
import {
  interpret,
  isValidRegion,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";

import { createAwsApi } from "../lib/api.js";
import { runCli } from "../lib/cli.js";
import { DEADLINE_MS } from "../lib/explorer.js";

const env = (name: string): string | undefined => process.env[name];

/** The account aws-context last verified for this project, only to flag a mismatch. */
async function contextAccount(): Promise<string | null> {
  const projectDir = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const path = snapshotPath(env, await workspaceId(projectDir));
  const read = path === null ? null : readTextBounded(path, MAX_SNAPSHOT_BYTES);
  const parsed = read?.kind === "ok" ? parseSnapshot(read.text) : null;
  const snapshot = parsed?.ok === true ? parsed.snapshot : null;
  return interpret(snapshot, Date.now()).snapshot?.accountId ?? null;
}

try {
  const account = await contextAccount().catch(() => null);
  const fallback = process.env["AWS_DEFAULT_REGION"]?.trim();
  const result = await runCli(process.argv.slice(2), {
    sdkRegion: resolveSdkRegion,
    fallbackRegion: fallback !== undefined && isValidRegion(fallback) ? fallback : null,
    api: (region) => createAwsApi(region, DEADLINE_MS),
    contextAccount: () => account,
  });
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  // Never print the error object: SDK errors can carry request details.
  process.stderr.write(
    `aws-explorer failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
  );
  process.exitCode = 1;
}

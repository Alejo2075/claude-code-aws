import { resolveSdkRegion } from "@claude-code-aws/aws-client";
import {
  claudeConfigDir,
  interpret,
  isValidRegion,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";

import { createDeployApi } from "../lib/aws.js";
import { runCli } from "../lib/cli.js";

const env = (name: string): string | undefined => process.env[name];

try {
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const id = await workspaceId(root);
  const path = snapshotPath(env, id);
  const read = path === null ? null : readTextBounded(path, MAX_SNAPSHOT_BYTES);
  const parsed = read?.kind === "ok" ? parseSnapshot(read.text) : null;
  const snapshot = interpret(parsed?.ok === true ? parsed.snapshot : null, Date.now()).snapshot;
  const fallback = process.env["AWS_DEFAULT_REGION"]?.trim();
  const result = await runCli(process.argv.slice(2), {
    root,
    env: process.env,
    configDir: claudeConfigDir(env),
    workspaceId: id,
    api: (region) => createDeployApi(region),
    sdkRegion: resolveSdkRegion,
    fallbackRegion: fallback !== undefined && isValidRegion(fallback) ? fallback : null,
    known: () =>
      snapshot?.accountId == null
        ? null
        : { accountId: snapshot.accountId, environment: snapshot.environment },
  });
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(
    `aws-deploy failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
  );
  process.exitCode = 1;
}

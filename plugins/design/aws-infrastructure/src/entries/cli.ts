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
import { executionContext } from "@claude-code-aws/report-contract";

import { runCli } from "../lib/cli.js";
import { createDeployedApi } from "../lib/deployed.js";

const env = (name: string): string | undefined => process.env[name];

try {
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const path = snapshotPath(env, await workspaceId(root));
  const read = path === null ? null : readTextBounded(path, MAX_SNAPSHOT_BYTES);
  const parsed = read?.kind === "ok" ? parseSnapshot(read.text) : null;
  const interpretation = interpret(parsed?.ok === true ? parsed.snapshot : null, Date.now());
  const fallback = process.env["AWS_DEFAULT_REGION"]?.trim();
  const result = await runCli(process.argv.slice(2), {
    root,
    env: process.env,
    context: () => executionContext(interpretation),
    contextEnvironment: () =>
      interpretation.snapshot?.accountId == null
        ? null
        : {
            accountId: interpretation.snapshot.accountId,
            environment: interpretation.snapshot.environment,
            profile: interpretation.snapshot.profile,
          },
    sdkRegion: resolveSdkRegion,
    fallbackRegion: fallback !== undefined && isValidRegion(fallback) ? fallback : null,
    deployedApi: (region) => createDeployedApi(region),
  });
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  // Never print the error object: it can carry request details.
  process.stderr.write(
    `aws-infrastructure failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
  );
  process.exitCode = 1;
}

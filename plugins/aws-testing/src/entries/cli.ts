import { verifyWithSts } from "@claude-code-aws/aws-client";
import { resolveSdkRegion } from "@claude-code-aws/aws-client";
import {
  interpret,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";

import { runCli } from "../lib/cli.js";

const env = (name: string): string | undefined => process.env[name];

try {
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const path = snapshotPath(env, await workspaceId(root));
  const read = path === null ? null : readTextBounded(path, MAX_SNAPSHOT_BYTES);
  const parsed = read?.kind === "ok" ? parseSnapshot(read.text) : null;
  const snapshot = interpret(parsed?.ok === true ? parsed.snapshot : null, Date.now()).snapshot;
  const result = await runCli(process.argv.slice(2), {
    root,
    env: process.env,
    integration: {
      identity: async () =>
        verifyWithSts({ region: (await resolveSdkRegion()) ?? "us-east-1", timeoutMs: 15_000 }),
      known: () =>
        snapshot?.accountId == null
          ? null
          : { accountId: snapshot.accountId, environment: snapshot.environment },
    },
  });
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(
    `aws-testing failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
  );
  process.exitCode = 1;
}

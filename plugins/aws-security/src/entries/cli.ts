import {
  claudeConfigDir,
  interpret,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";
import { executionContext } from "@claude-code-aws/report-contract";

import { runCli } from "../lib/cli.js";
import { type Exclusion, parseExclusions } from "../lib/exclusions.js";

const env = (name: string): string | undefined => process.env[name];

function readExclusions(
  path: string | null,
  source: "user" | "project",
): { exclusions: Exclusion[]; warnings: string[] } {
  if (path === null) return { exclusions: [], warnings: [] };
  const read = readTextBounded(path, 256 * 1024);
  if (read.kind === "missing") return { exclusions: [], warnings: [] };
  if (read.kind !== "ok")
    return { exclusions: [], warnings: [`${source} config: could not be read; ignored`] };
  return parseExclusions(read.text, source);
}

try {
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const path = snapshotPath(env, await workspaceId(root));
  const read = path === null ? null : readTextBounded(path, MAX_SNAPSHOT_BYTES);
  const parsed = read?.kind === "ok" ? parseSnapshot(read.text) : null;
  const interpretation = interpret(parsed?.ok === true ? parsed.snapshot : null, Date.now());
  const base = claudeConfigDir(env);
  const user = readExclusions(base === null ? null : `${base}/aws-security/config.json`, "user");
  const project = readExclusions(`${root.replace(/[\\/]+$/, "")}/.aws-security.json`, "project");
  const result = await runCli(process.argv.slice(2), {
    root,
    context: () => executionContext(interpretation),
    exclusions: () => ({
      exclusions: [...user.exclusions, ...project.exclusions],
      warnings: [...user.warnings, ...project.warnings],
    }),
  });
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(
    `aws-security failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
  );
  process.exitCode = 1;
}

// Opt-in status-line command. Claude Code runs it with session JSON on stdin; it prints one line
// built from the snapshot aws-context stored. It never calls AWS, never fails the status line, and
// prints the "not configured" line on any problem.
import { fileURLToPath } from "node:url";

import {
  formatFooterLine,
  interpret,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  snapshotPath,
  workspaceId,
  type EnvReader,
} from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";

import { setup } from "../lib/statusline-setup.js";

const env: EnvReader = (name) => process.env[name];
const WIDTH = 100;

function readText(path: string | null, limit: number): string | null {
  if (path === null) return null;
  const read = readTextBounded(path, limit);
  return read.kind === "ok" ? read.text : null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function projectDirOf(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    const workspace = (parsed as { workspace?: { project_dir?: unknown; current_dir?: unknown } })
      .workspace;
    const dir =
      workspace?.project_dir ?? workspace?.current_dir ?? (parsed as { cwd?: unknown }).cwd;
    if (typeof dir === "string" && dir !== "") return dir;
  } catch {
    // Fall through to the process directory.
  }
  return process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
}

async function render(): Promise<string> {
  const projectDir = projectDirOf(await readStdin());
  const path = snapshotPath(env, await workspaceId(projectDir));
  const text = readText(path, MAX_SNAPSHOT_BYTES);
  const parsed = text === null ? null : parseSnapshot(text);
  const snapshot = parsed?.ok === true ? parsed.snapshot : null;
  return formatFooterLine(interpret(snapshot, Date.now()), WIDTH);
}

const args = process.argv.slice(2);
try {
  if (args[0] === "setup") {
    const copy = args.includes("--copy");
    process.stdout.write(`${setup(env, fileURLToPath(import.meta.url), { copy }).text}\n`);
  } else {
    process.stdout.write(`${await render()}\n`);
  }
} catch {
  process.stdout.write("\n");
}

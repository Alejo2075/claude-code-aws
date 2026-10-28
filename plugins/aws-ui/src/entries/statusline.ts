// Opt-in status-line command. Claude Code runs it with session JSON on stdin; it prints one line
// built from the snapshot aws-context stored. It never calls AWS, never fails the status line, and
// prints the "not configured" line on any problem.
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  type ConfigLayer,
  formatBar,
  interpret,
  MAX_CONFIG_BYTES,
  MAX_SNAPSHOT_BYTES,
  parseConfig,
  parseSnapshot,
  snapshotPath,
  userConfigPath,
  workspaceId,
  type EnvReader,
} from "@claude-code-aws/context-contract";

import { setup } from "../lib/statusline-setup.js";

const env: EnvReader = (name) => process.env[name];
const WIDTH = 100;

function readText(path: string | null, limit: number): string | null {
  if (path === null) return null;
  try {
    return statSync(path).size > limit ? null : readFileSync(path, "utf8");
  } catch {
    return null;
  }
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
  const parsed = (text: string | null) => (text === null ? null : parseSnapshot(text));
  const snapshotResult = parsed(readText(path, MAX_SNAPSHOT_BYTES));
  const snapshot = snapshotResult?.ok === true ? snapshotResult.snapshot : null;
  const configText = readText(userConfigPath(env), MAX_CONFIG_BYTES);
  const preferences: Pick<ConfigLayer, "maskAccountId" | "showProfile"> =
    configText === null ? {} : parseConfig(configText, "user").layer;
  return formatBar(interpret(snapshot, Date.now()), {
    maskAccountId: preferences.maskAccountId ?? true,
    showProfile: preferences.showProfile ?? true,
    width: WIDTH,
  });
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
  process.stdout.write(`${formatBar(interpret(null, Date.now()))}\n`);
}

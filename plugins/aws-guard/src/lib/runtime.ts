import {
  claudeConfigDir,
  type EnvReader,
  interpret,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";

import {
  type ConfigSource,
  MAX_CONFIG_BYTES,
  mergeGuardConfig,
  parseGuardConfig,
} from "./config.js";
import type { EvaluateContext } from "./evaluate.js";

export const processEnv: EnvReader = (name) => process.env[name];

export function currentProjectDir(fallback: string): string {
  const fromClaude = process.env["CLAUDE_PROJECT_DIR"];
  return fromClaude !== undefined && fromClaude !== "" ? fromClaude : fallback;
}

export function userConfigFile(env: EnvReader): string | null {
  const base = claudeConfigDir(env);
  return base === null ? null : `${base}/aws-guard/config.json`;
}

export function projectConfigFile(projectDir: string): string {
  return `${projectDir.replace(/[\\/]+$/, "")}/.aws-guard.json`;
}

function readLayer(path: string | null, source: ConfigSource) {
  if (path === null) return undefined;
  const read = readTextBounded(path, MAX_CONFIG_BYTES);
  if (read.kind === "missing") return undefined;
  // An unreadable or oversized file is reported as invalid and ignored; the defaults still ask.
  return parseGuardConfig(
    read.kind === "ok" ? read.text : " ".repeat(MAX_CONFIG_BYTES + 1),
    source,
  );
}

/** Everything the policy needs, read from local files only. No network. */
export async function loadContext(
  env: EnvReader,
  projectDir: string,
  mode: string,
  now: number = Date.now(),
): Promise<EvaluateContext> {
  const config = mergeGuardConfig(
    readLayer(userConfigFile(env), "user"),
    readLayer(projectConfigFile(projectDir), "project"),
  );
  const path = snapshotPath(env, await workspaceId(projectDir));
  const read = path === null ? null : readTextBounded(path, MAX_SNAPSHOT_BYTES);
  const parsed = read?.kind === "ok" ? parseSnapshot(read.text) : null;
  const snapshot = parsed?.ok === true ? parsed.snapshot : null;
  const profile = env("AWS_PROFILE")?.trim();
  return {
    identity: interpret(snapshot, now),
    processProfile: profile === undefined || profile === "" ? null : profile,
    config,
    mode,
  };
}

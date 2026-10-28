import { statSync } from "node:fs";

import {
  type AwsContextSnapshotV1,
  type EffectiveConfig,
  type EnvReader,
  interpret,
  isRefreshDue,
  snapshotDir,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";

import { loadConfig } from "./config-files.js";
import { refreshContext } from "./refresh.js";
import { pruneSnapshots, readSnapshotFile, writeSnapshotFile } from "./store.js";
import { resolveSdkRegion, verifyWithSts } from "./sts.js";

export const processEnv: EnvReader = (name) => process.env[name];

export function currentProjectDir(fallback: string): string {
  const fromClaude = process.env["CLAUDE_PROJECT_DIR"];
  return fromClaude !== undefined && fromClaude !== "" ? fromClaude : fallback;
}

export interface Loaded {
  config: EffectiveConfig;
  path: string | null;
  snapshot: AwsContextSnapshotV1 | null;
}

/** Local read only: no network. */
export async function loadStored(projectDir: string, env: EnvReader = processEnv): Promise<Loaded> {
  const path = snapshotPath(env, await workspaceId(projectDir));
  return {
    config: loadConfig(env, projectDir),
    path,
    snapshot: path === null ? null : readSnapshotFile(path),
  };
}

export interface RefreshOutcome extends Loaded {
  snapshot: AwsContextSnapshotV1;
  /** Set when the snapshot could not be written (no home directory, read-only disk). */
  writeFailed: boolean;
}

/** The only function that touches the network (one STS call) and the only one that writes. */
export async function refreshAndStore(
  projectDir: string,
  timeoutMs: number,
  env: EnvReader = processEnv,
): Promise<RefreshOutcome> {
  const stored = await loadStored(projectDir, env);
  const now = new Date();
  const snapshot = await refreshContext({
    env,
    projectDir,
    now,
    config: stored.config,
    prior: stored.snapshot,
    resolveSdkRegion,
    verify: verifyWithSts,
    timeoutMs,
  });
  let writeFailed = stored.path === null;
  if (stored.path !== null) {
    try {
      writeSnapshotFile(stored.path, snapshot);
      const dir = snapshotDir(env);
      if (dir !== null) pruneSnapshots(dir, now.getTime());
    } catch {
      writeFailed = true;
    }
  }
  return { ...stored, snapshot, writeFailed };
}

/**
 * Re-verifies in the background when the stored check is old. Does nothing when the user turned
 * `autoRefresh` off, when there is no stored snapshot (the session-start hook creates it), when the
 * check is still current, or when the file was written less than one time-to-live ago, so a failing
 * check is retried once per window and never on every prompt. Returns whether it refreshed.
 */
export async function refreshIfDue(
  projectDir: string,
  timeoutMs: number,
  env: EnvReader = processEnv,
): Promise<boolean> {
  const stored = await loadStored(projectDir, env);
  if (!stored.config.autoRefresh || stored.path === null || stored.snapshot === null) return false;
  let lastWriteMs: number;
  try {
    lastWriteMs = statSync(stored.path).mtimeMs;
  } catch {
    return false;
  }
  const now = Date.now();
  const due = isRefreshDue(
    interpret(stored.snapshot, now),
    lastWriteMs,
    now,
    stored.config.ttlMinutes,
  );
  if (!due) return false;
  await refreshAndStore(projectDir, timeoutMs, env);
  return true;
}

import {
  type AwsContextSnapshotV1,
  type EffectiveConfig,
  type EnvReader,
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

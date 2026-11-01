import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  type AwsContextSnapshotV1,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  serializeSnapshot,
} from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_FILE = /^[0-9a-f]{16}\.json$/;

/** Reads a snapshot. Missing, oversized, corrupt, or old-schema files all yield null. */
export function readSnapshotFile(path: string): AwsContextSnapshotV1 | null {
  const read = readTextBounded(path, MAX_SNAPSHOT_BYTES);
  if (read.kind !== "ok") return null;
  const parsed = parseSnapshot(read.text);
  return parsed.ok ? parsed.snapshot : null;
}

/** Atomic write (temp file in the same directory, then rename), private to the user where supported. */
export function writeSnapshotFile(path: string, snapshot: AwsContextSnapshotV1): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = join(dir, `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, serializeSnapshot(snapshot), { flag: "wx", mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function removeSnapshots(dir: string, shouldRemove: (mtimeMs: number) => boolean): number {
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!SNAPSHOT_FILE.test(name)) continue;
    const path = join(dir, name);
    try {
      if (shouldRemove(statSync(path).mtimeMs)) {
        rmSync(path, { force: true });
        removed += 1;
      }
    } catch {
      // A file that vanished or cannot be inspected is not our problem.
    }
  }
  return removed;
}

/** Deletes snapshots not modified within the retention window. Returns how many were removed. */
export function pruneSnapshots(dir: string, now: number, maxAgeMs = RETENTION_MS): number {
  return removeSnapshots(dir, (mtimeMs) => now - mtimeMs > maxAgeMs);
}

/** Deletes every stored snapshot (not the configuration file). */
export function purgeSnapshots(dir: string): number {
  return removeSnapshots(dir, () => true);
}

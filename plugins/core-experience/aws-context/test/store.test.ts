import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  pruneSnapshots,
  purgeSnapshots,
  readSnapshotFile,
  RETENTION_MS,
  writeSnapshotFile,
} from "../src/lib/store.js";
import { refreshContext } from "../src/lib/refresh.js";
import { deps } from "./helpers.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "aws-context-store-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("snapshot store", () => {
  it("round-trips and leaves no temp files", async () => {
    const snapshot = await refreshContext(deps());
    const path = join(dir, "v1", "0123456789abcdef.json");
    writeSnapshotFile(path, snapshot);
    writeSnapshotFile(path, snapshot);
    expect(readSnapshotFile(path)).toEqual(snapshot);
    expect(readdirSync(join(dir, "v1"))).toEqual(["0123456789abcdef.json"]);
  });

  it.skipIf(process.platform === "win32")("is private to the user", async () => {
    const path = join(dir, "v1", "0123456789abcdef.json");
    writeSnapshotFile(path, await refreshContext(deps()));
    expect(statSync(path).mode & 0o077).toBe(0);
    expect(statSync(join(dir, "v1")).mode & 0o077).toBe(0);
  });

  it("ignores missing, corrupt, oversized, and wrong-schema files", () => {
    mkdirSync(join(dir, "v1"));
    const path = join(dir, "v1", "0123456789abcdef.json");
    expect(readSnapshotFile(path)).toBeNull();
    writeFileSync(path, "{ truncated");
    expect(readSnapshotFile(path)).toBeNull();
    writeFileSync(path, JSON.stringify({ schemaVersion: 9 }));
    expect(readSnapshotFile(path)).toBeNull();
    writeFileSync(path, " ".repeat(40_000));
    expect(readSnapshotFile(path)).toBeNull();
  });

  it("prunes old snapshots only, and never other files", () => {
    mkdirSync(join(dir, "v1"));
    const old = join(dir, "v1", "aaaaaaaaaaaaaaaa.json");
    const fresh = join(dir, "v1", "bbbbbbbbbbbbbbbb.json");
    const foreign = join(dir, "v1", "notes.txt");
    for (const file of [old, fresh, foreign]) writeFileSync(file, "x");
    const longAgo = new Date(Date.now() - RETENTION_MS - 60_000);
    utimesSync(old, longAgo, longAgo);
    utimesSync(foreign, longAgo, longAgo);
    expect(pruneSnapshots(join(dir, "v1"), Date.now())).toBe(1);
    expect(readdirSync(join(dir, "v1")).sort()).toEqual(["bbbbbbbbbbbbbbbb.json", "notes.txt"]);
    expect(purgeSnapshots(join(dir, "v1"))).toBe(1);
    expect(readdirSync(join(dir, "v1"))).toEqual(["notes.txt"]);
  });

  it("tolerates a missing directory", () => {
    expect(pruneSnapshots(join(dir, "nope"), Date.now())).toBe(0);
    expect(purgeSnapshots(join(dir, "nope"))).toBe(0);
  });
});

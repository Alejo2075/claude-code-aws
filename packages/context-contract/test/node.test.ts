import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTextBounded } from "../src/node.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "contract-node-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readTextBounded", () => {
  it("reads a file within the limit, including exactly at the limit", () => {
    writeFileSync(join(dir, "a"), "hello");
    expect(readTextBounded(join(dir, "a"), 5)).toEqual({ kind: "ok", text: "hello" });
    expect(readTextBounded(join(dir, "a"), 100)).toEqual({ kind: "ok", text: "hello" });
  });

  it("refuses a file one byte over the limit without returning content", () => {
    writeFileSync(join(dir, "a"), "hello!");
    expect(readTextBounded(join(dir, "a"), 5)).toEqual({ kind: "too-large" });
  });

  it("reports missing files and non-regular files", () => {
    expect(readTextBounded(join(dir, "nope"), 10)).toEqual({ kind: "missing" });
    expect(readTextBounded(dir, 10)).toEqual({ kind: "unreadable" });
  });

  it("reads an empty file", () => {
    writeFileSync(join(dir, "empty"), "");
    expect(readTextBounded(join(dir, "empty"), 10)).toEqual({ kind: "ok", text: "" });
  });

  it.skipIf(process.platform === "win32")("follows a symlink to a regular file", () => {
    writeFileSync(join(dir, "real"), "x");
    symlinkSync(join(dir, "real"), join(dir, "link"));
    expect(readTextBounded(join(dir, "link"), 10)).toEqual({ kind: "ok", text: "x" });
  });
});

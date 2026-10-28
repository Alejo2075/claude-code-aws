// Node-only helpers. Kept out of the package index because a mod's hooks module has no Node APIs
// and bundles the index. Import as "@claude-code-aws/context-contract/node".
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export type BoundedRead =
  | { kind: "ok"; text: string }
  | { kind: "missing" }
  | { kind: "too-large" }
  | { kind: "unreadable" };

/**
 * Reads a regular file of at most `maxBytes` through one file descriptor. Checking the size with a
 * separate stat and then reading would let the file grow in between, so the limit is enforced on
 * the bytes actually read. Anything that is not a regular file is refused.
 */
export function readTextBounded(path: string, maxBytes: number): BoundedRead {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "missing" }
      : { kind: "unreadable" };
  }
  try {
    if (!fstatSync(fd).isFile()) return { kind: "unreadable" };
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const read = readSync(fd, buffer, total, buffer.length - total, null);
      if (read === 0) break;
      total += read;
    }
    return total > maxBytes
      ? { kind: "too-large" }
      : { kind: "ok", text: buffer.toString("utf8", 0, total) };
  } catch {
    return { kind: "unreadable" };
  } finally {
    closeSync(fd);
  }
}

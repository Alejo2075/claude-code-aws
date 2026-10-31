import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { isInside } from "@claude-code-aws/tool-runner";

export type WriteResult = { ok: true; file: string } | { ok: false; error: string };

/** Creates a new file inside the project. An existing file is never touched (exclusive create). */
export function writeNew(root: string, path: string, content: string | Buffer): WriteResult {
  const target = isAbsolute(path) ? path : resolve(root, path);
  if (!isInside(root, target))
    return { ok: false, error: "the output path is outside the project" };
  try {
    mkdirSync(dirname(target), { recursive: true });
    // A directory made by the line above could be replaced by a link before the open: check again.
    if (!isInside(root, target))
      return { ok: false, error: "the output path is outside the project" };
    const fd = openSync(target, "wx");
    try {
      writeSync(fd, typeof content === "string" ? Buffer.from(content, "utf8") : content);
    } finally {
      closeSync(fd);
    }
    return { ok: true, file: target.slice(resolve(root).length + 1) };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EEXIST"
      ? {
          ok: false,
          error: `${path} already exists; it was not overwritten. Choose another --out.`,
        }
      : { ok: false, error: "the file could not be written" };
  }
}

export const DEFAULT_DIR = join("docs", "architecture", "diagrams");

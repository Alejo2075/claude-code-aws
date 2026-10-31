import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

function realLocation(path: string): string {
  let current = resolve(path);
  const missing: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  return join(existsSync(current) ? realpathSync(current) : current, ...missing);
}

/** True when `path` is `root` or inside it, after resolving links. */
export function isInside(root: string, path: string): boolean {
  const rel = relative(realLocation(root), realLocation(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

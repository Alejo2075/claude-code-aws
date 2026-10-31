// Looks inside one prototype directory for what must not be promoted: secrets, wildcard
// permissions, and shortcut markers. Bounded, does not follow links, never leaves the directory.
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readTextBounded } from "@claude-code-aws/context-contract/node";
import { redactText } from "@claude-code-aws/safe-output";

export interface ScanHit {
  file: string;
  kind: "secret" | "wildcard-permission" | "shortcut" | "fixture";
  detail: string;
}

const MAX_FILES = 300;
const MAX_BYTES = 200_000;
const SKIP = new Set(["node_modules", ".git", "cdk.out", "dist"]);
const SHORTCUT = /\b(TODO|FIXME|HACK|XXX|insecure|hard-?coded|disable[_-]?auth|skip[_-]?auth)\b/i;
/** Words that mark a shortcut taken for the prototype. A local host name is checked separately. */
const LOCAL_HOST = "local" + "host";
const JSON_WILDCARD = /"(?:Action|Resource)"\s*:\s*"\*"/;
const YAML_WILDCARD = /^\s*(?:Action|Resource):\s*['"]?\*['"]?\s*$/m;

export function scanDirectory(dir: string): {
  hits: ScanHit[];
  filesRead: number;
  truncated: boolean;
} {
  const hits: ScanHit[] = [];
  let filesRead = 0;
  let truncated = false;
  const walk = (current: string, rel: string, depth: number): void => {
    if (depth > 8) return;
    let names: string[];
    try {
      names = readdirSync(current).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP.has(name)) continue;
      const full = join(current, name);
      const relative = rel === "" ? name : `${rel}/${name}`;
      let info;
      try {
        info = lstatSync(full);
      } catch {
        continue;
      }
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        walk(full, relative, depth + 1);
        continue;
      }
      if (!info.isFile() || info.size > MAX_BYTES) continue;
      if (filesRead >= MAX_FILES) {
        truncated = true;
        return;
      }
      const read = readTextBounded(full, MAX_BYTES);
      if (read.kind !== "ok" || read.text.includes("\u0000")) continue;
      filesRead += 1;
      if (redactText(read.text, { personalData: false }).redacted > 0)
        hits.push({
          file: relative,
          kind: "secret",
          detail: "contains a secret-like or personal value",
        });
      if (JSON_WILDCARD.test(read.text) || YAML_WILDCARD.test(read.text))
        hits.push({
          file: relative,
          kind: "wildcard-permission",
          detail: 'grants "*" on actions or resources',
        });
      if (!relative.endsWith(".md")) {
        const m = SHORTCUT.exec(read.text);
        if (m === null && read.text.toLowerCase().includes(LOCAL_HOST))
          hits.push({ file: relative, kind: "shortcut", detail: `contains "${LOCAL_HOST}"` });
        if (m !== null)
          hits.push({ file: relative, kind: "shortcut", detail: `contains "${m[1] ?? m[0]}"` });
      }
      if (relative.startsWith("fixtures/"))
        hits.push({
          file: relative,
          kind: "fixture",
          detail: "fixture data: do not copy into production code",
        });
    }
  };
  walk(dir, "", 0);
  return { hits, filesRead, truncated };
}

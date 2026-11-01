// Fails a pull request that changes what a released plugin ships without a changeset for it.
// Usage: tsx scripts/check-changesets.ts [base-ref]   (default: origin/main)
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { isShippedPluginPath, parseChangesetPackages } from "./lib/checks.js";
import { fail, isReleased, listPlugins, REPO_ROOT, run } from "./lib/workspace.js";

const base = process.argv[2] ?? process.env["CHANGESET_BASE_REF"] ?? "origin/main";
const diff = run("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: REPO_ROOT });
if (diff.status !== 0) fail(`git diff against ${base} failed: ${diff.stderr}`);
const changed = diff.stdout.split(/\r?\n/).filter(Boolean);

const covered = new Set(
  changed
    .filter((file) => /^\.changeset\/[^/]+\.md$/.test(file) && !file.endsWith("README.md"))
    .flatMap((file) => {
      try {
        return parseChangesetPackages(readFileSync(join(REPO_ROOT, file), "utf8"));
      } catch {
        return []; // deleted changeset files (consumed by a Version PR)
      }
    }),
);

const missing = listPlugins()
  .filter(isReleased)
  .filter((plugin) => {
    const pluginPath = `${relative(REPO_ROOT, plugin.dir).replaceAll("\\", "/")}/`;
    return changed.some(
      (file) => file.startsWith(pluginPath) && isShippedPluginPath(file.slice(pluginPath.length)),
    );
  })
  .filter((plugin) => !covered.has(plugin.packageName))
  .map((plugin) => plugin.name);

if (missing.length > 0) {
  fail(`shipped files changed without a changeset for: ${missing.join(", ")}. Run pnpm changeset.`);
}
console.log("✔ every changed released plugin has a changeset");

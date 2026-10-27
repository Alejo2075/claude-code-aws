// Assembles the installable release tree in out/release (or the directory given as argument).
import { join, relative } from "node:path";

import { buildReleaseTree } from "./lib/release.js";
import { REPO_ROOT, runClaude, fail } from "./lib/workspace.js";

const outDir = process.argv[2] ?? join(REPO_ROOT, "out", "release");
const tree = buildReleaseTree({ outDir });
for (const target of [tree.outDir, ...tree.plugins.map((plugin) => plugin.dir)]) {
  const result = runClaude([
    "plugin",
    "validate",
    target,
    ...(tree.plugins.length > 0 ? ["--strict"] : []),
  ]);
  if (result.status !== 0)
    fail(`release tree validation failed for ${target}:\n${result.stdout}${result.stderr}`);
}
console.log(
  `✔ release tree at ${relative(REPO_ROOT, tree.outDir)} with ${tree.plugins.length} plugin(s): ${
    tree.plugins.map((plugin) => `${plugin.name}@${plugin.packageVersion}`).join(", ") || "none"
  }`,
);

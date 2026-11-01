// Usage: pnpm new:plugin <name> "<one-line description>"
import { join, relative } from "node:path";

import { scaffoldPlugin } from "./lib/scaffold.js";
import { fail, listPlugins, REPO_ROOT, run } from "./lib/workspace.js";

const [name, description] = process.argv.slice(2);
if (!name || !description) fail('usage: pnpm new:plugin <name> "<one-line description>"');
if (listPlugins().some((plugin) => plugin.name === name)) fail(`plugin "${name}" already exists`);

try {
  const dir = scaffoldPlugin({
    name,
    description,
    pluginsRoot: join(REPO_ROOT, "plugins", "development", "services"),
  });
  // Templates are excluded from Prettier because their placeholders are not valid Markdown names.
  run(process.execPath, [
    join(REPO_ROOT, "node_modules", "prettier", "bin", "prettier.cjs"),
    "--write",
    "--log-level",
    "warn",
    dir,
  ]);
  console.log(`✔ created ${relative(REPO_ROOT, dir)} at version 0.0.0 (unreleased)
Next steps:
  1. pnpm install
  2. Replace every TEMPLATE-TODO (list them with: pnpm check:template-markers --all)
  3. pnpm build && pnpm test && pnpm validate
  4. When the plugin is ready to ship, add a changeset: pnpm changeset (minor bump -> 0.1.0)
See docs/development.md.`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

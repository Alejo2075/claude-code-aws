import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES = join(PLUGIN, "..", "..", "tests", "fixtures", "serverless");

/**
 * A throwaway project inside the plugin directory, so Node resolves the repository's own vitest by
 * walking up. Its test files are named so the repository's own test run does not pick them up.
 */
export function tempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(PLUGIN, ".tmp-project-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "tmp", type: "module", devDependencies: { vitest: "*" } }),
  );
  writeFileSync(
    join(root, "vitest.config.ts"),
    'export default { test: { include: ["**/*.t.ts"] } };\n',
  );
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}

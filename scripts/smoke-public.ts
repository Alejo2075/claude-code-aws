// Post-release smoke test: installs plugins from the public marketplace over HTTPS into an
// isolated Claude Code config, exactly as a new user would.
// Usage: tsx scripts/smoke-public.ts <plugin> [plugin...]
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fail, GITHUB_REPO, MARKETPLACE_NAME, runClaude } from "./lib/workspace.js";

const plugins = process.argv.slice(2);
if (plugins.length === 0) fail("usage: tsx scripts/smoke-public.ts <plugin> [plugin...]");

const configDir = mkdtempSync(join(tmpdir(), "cca-smoke-"));
const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_PLUGIN_PREFER_HTTPS: "1" };
try {
  const added = runClaude(["plugin", "marketplace", "add", GITHUB_REPO], { env });
  if (added.status !== 0) fail(`marketplace add failed:\n${added.stdout}${added.stderr}`);
  for (const name of plugins) {
    const id = `${name}@${MARKETPLACE_NAME}`;
    const installed = runClaude(["plugin", "install", id], { env });
    if (installed.status !== 0)
      fail(`install ${id} failed:\n${installed.stdout}${installed.stderr}`);
    const details = runClaude(["plugin", "details", id], { env });
    if (details.status !== 0) fail(`details ${id} failed:\n${details.stdout}${details.stderr}`);
    console.log(`✔ ${id} installs from the public marketplace`);
  }
} finally {
  rmSync(configDir, { recursive: true, force: true, maxRetries: 3 });
}

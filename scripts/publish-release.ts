// Publishes out/release to the `release` branch, tags new plugin versions, and creates GitHub
// Releases. See scripts/lib/publish.ts and docs/release.md.
//
// Usage: tsx scripts/publish-release.ts [--dry-run]
// Requires: a clean checkout with an `origin` remote, `pnpm build:release` already run, and for a
// real release push access to `release` plus an authenticated `gh` for GitHub Releases.
import { appendFileSync } from "node:fs";

import { publishRelease } from "./lib/publish.js";
import { fail } from "./lib/workspace.js";

function setOutput(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

try {
  const result = publishRelease({ dryRun: process.argv.includes("--dry-run"), log: console.log });
  setOutput("published", String(result.published));
  setOutput("plugins", result.plugins.map((plugin) => plugin.name).join(" "));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

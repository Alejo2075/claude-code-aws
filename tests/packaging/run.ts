// Installs every plugin of a release tree into an isolated Claude Code config from a local git
// repository and checks it loads, runs its hooks from the cache, and uninstalls cleanly.
// Usage: tsx tests/packaging/run.ts [release-dir]   (default: out/release)
import { existsSync } from "node:fs";
import { join } from "node:path";

import { testPackaging } from "../../scripts/lib/packaging.js";
import { fail, REPO_ROOT } from "../../scripts/lib/workspace.js";

const releaseDir = process.argv[2] ?? join(REPO_ROOT, "out", "release");
if (!existsSync(releaseDir)) fail(`${releaseDir} does not exist; run pnpm build:release first`);

const reports = await testPackaging(releaseDir);
if (reports.length === 0) {
  console.log(
    "✔ release tree has no plugins; nothing to install (pnpm test:pipeline covers the template)",
  );
  process.exit(0);
}
let failed = false;
for (const report of reports) {
  for (const check of report.checks) {
    console.log(`${check.ok ? "✔" : "✘"} ${report.plugin}: ${check.name}`);
    if (!check.ok) {
      failed = true;
      if (check.detail) console.log(`    ${check.detail.split("\n").join("\n    ")}`);
    }
  }
}
if (failed) fail("packaging test failed");
console.log(`✔ ${reports.length} plugin(s) install and run from the plugin cache`);

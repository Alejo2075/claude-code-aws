// End-to-end self-test of the plugin pipeline, with no plugin committed to the repository:
// scaffold from templates/plugin -> typecheck -> build -> unit and hook tests -> simulated
// version bump -> catalog sync and checks -> strict validation -> release tree -> install from a
// git-backed marketplace into an isolated Claude Code config.
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPlugin } from "./lib/build.js";
import { checkVersions, findTemplateMarkers, syncCatalog } from "./lib/checks.js";
import { testPackaging } from "./lib/packaging.js";
import { buildReleaseTree } from "./lib/release.js";
import { scaffoldPlugin } from "./lib/scaffold.js";
import {
  type Catalog,
  catalogPath,
  fail,
  listPlugins,
  type PluginManifest,
  readJson,
  REPO_ROOT,
  run,
  runClaude,
  writeJson,
} from "./lib/workspace.js";

const NAME = "pipeline-check";
const keep = process.argv.includes("--keep");
const root = mkdtempSync(join(tmpdir(), "cca-selftest-"));
let step = 0;

function ok(message: string): void {
  step += 1;
  console.log(`✔ ${step}. ${message}`);
}

function must(condition: boolean, message: string, detail = ""): void {
  if (!condition) fail(`${message}${detail ? `\n${detail}` : ""}`);
}

try {
  for (const file of ["LICENSE", "tsconfig.base.json"])
    cpSync(join(REPO_ROOT, file), join(root, file));
  mkdirSync(join(root, ".claude-plugin"));
  writeJson(catalogPath(root), { ...readJson<Catalog>(catalogPath()), plugins: [] });
  symlinkSync(join(REPO_ROOT, "node_modules"), join(root, "node_modules"), "junction");

  const pluginDir = scaffoldPlugin({
    name: NAME,
    description: "Pipeline self-test plugin generated from the template",
    pluginsRoot: join(root, "plugins"),
  });
  mkdirSync(join(pluginDir, "node_modules", "@claude-code-aws"), { recursive: true });
  symlinkSync(
    join(REPO_ROOT, "packages", "testkit"),
    join(pluginDir, "node_modules", "@claude-code-aws", "testkit"),
    "junction",
  );
  must(
    findTemplateMarkers(pluginDir).length > 0,
    "template markers should be present in a fresh scaffold",
  );
  ok("scaffolded plugin from templates/plugin");

  const tsc = run(process.execPath, [
    join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    join(pluginDir, "tsconfig.json"),
    "--noEmit",
  ]);
  must(tsc.status === 0, "template does not typecheck", tsc.stdout + tsc.stderr);
  ok("template typechecks under strict settings");

  const outputs = await buildPlugin(pluginDir);
  must(outputs.length > 0, "build produced no bundles");
  ok(`bundled ${outputs.length} entry point(s) into dist/`);

  const vitest = run(
    process.execPath,
    [join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "--root", pluginDir],
    {
      cwd: pluginDir,
    },
  );
  must(vitest.status === 0, "template tests failed", vitest.stdout + vitest.stderr);
  ok("template unit and hook-contract tests pass");

  // Simulate `pnpm version-packages` releasing 0.1.0.
  const pkgPath = join(pluginDir, "package.json");
  writeJson(pkgPath, { ...readJson<Record<string, unknown>>(pkgPath), version: "0.1.0" });
  const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
  writeJson(manifestPath, { ...readJson<PluginManifest>(manifestPath), version: "0.1.0" });
  const pluginsRoot = join(root, "plugins");
  writeJson(
    catalogPath(root),
    syncCatalog(listPlugins(pluginsRoot), readJson<Catalog>(catalogPath(root))),
  );
  const versionErrors = checkVersions(
    listPlugins(pluginsRoot),
    readJson<Catalog>(catalogPath(root)),
  );
  must(versionErrors.length === 0, "version checks failed after sync", versionErrors.join("\n"));
  ok("version bump synchronized into plugin.json and the catalog");

  for (const target of [root, pluginDir]) {
    const result = runClaude(["plugin", "validate", target, "--strict"]);
    must(
      result.status === 0,
      `claude plugin validate --strict failed for ${target}`,
      result.stdout + result.stderr,
    );
  }
  ok("catalog and plugin pass claude plugin validate --strict");

  const tree = buildReleaseTree({
    repoRoot: root,
    outDir: join(root, "out", "release"),
    selfTest: true,
  });
  must(tree.plugins.length === 1, "release tree should contain the plugin");
  must(
    !readJson<Catalog>(catalogPath(tree.outDir)).plugins.some(
      (entry) => typeof entry.source !== "string",
    ),
    "release catalog must use relative sources",
  );
  for (const target of [tree.outDir, ...tree.plugins.map((plugin) => plugin.dir)]) {
    const result = runClaude(["plugin", "validate", target, "--strict"]);
    must(
      result.status === 0,
      `release tree validation failed for ${target}`,
      result.stdout + result.stderr,
    );
  }
  ok("release tree assembled with only shipped files and validated");

  const reports = await testPackaging(tree.outDir);
  const failures = reports.flatMap((report) =>
    report.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.name}: ${check.detail ?? ""}`),
  );
  must(reports.length === 1 && failures.length === 0, "packaging test failed", failures.join("\n"));
  ok(
    `installed from a git-backed marketplace: ${reports[0]?.checks.map((check) => check.name).join(", ") ?? ""}`,
  );

  console.log("✔ pipeline self-test passed");
} finally {
  if (keep) console.log(`kept ${root}`);
  else rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}

// End-to-end test of the real publish path against a local bare git remote (no GitHub, no network):
// two plugins are released, installed by users from tags, released again with only one version
// bump, and updated. Proves that publishing is idempotent, that tags are never moved, that an
// unbumped plugin never ships rebuilt content, and that users receive updates through the catalog.
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { buildPlugin } from "./lib/build.js";
import { checkVersions, findTemplateMarkers, syncCatalog } from "./lib/checks.js";
import { publishRelease, RELEASE_BRANCH } from "./lib/publish.js";
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
  releaseTag,
  run,
  runClaude,
  writeJson,
} from "./lib/workspace.js";

const keep = process.argv.includes("--keep");
const root = mkdtempSync(join(tmpdir(), "cca-release-flow-"));
const workspace = join(root, "workspace");
const origin = join(root, "origin.git");
const pluginsRoot = join(workspace, "plugins");
let step = 0;

function ok(message: string): void {
  step += 1;
  console.log(`✔ ${step}. ${message}`);
}

function must(condition: boolean, message: string, detail = ""): void {
  if (!condition) fail(`${message}${detail ? `\n${detail}` : ""}`);
}

function git(cwd: string, args: string[]): string {
  const result = run("git", args, { cwd });
  must(result.status === 0, `git ${args.join(" ")} failed`, result.stderr);
  return result.stdout.trim();
}

function commitAll(message: string): void {
  git(workspace, ["add", "-A"]);
  git(workspace, [
    "-c",
    "user.name=selftest",
    "-c",
    "user.email=selftest@test.invalid",
    "commit",
    "-q",
    "-m",
    message,
  ]);
  git(workspace, ["push", "-q", "origin", "main"]);
}

function setVersion(name: string, version: string): void {
  for (const file of ["package.json", join(".claude-plugin", "plugin.json")]) {
    const path = join(pluginsRoot, name, file);
    writeJson(path, { ...readJson<PluginManifest>(path), version });
  }
  writeJson(
    catalogPath(workspace),
    syncCatalog(listPlugins(pluginsRoot), readJson<Catalog>(catalogPath(workspace))),
  );
  const errors = checkVersions(listPlugins(pluginsRoot), readJson<Catalog>(catalogPath(workspace)));
  must(errors.length === 0, "version checks failed", errors.join("\n"));
}

function listFiles(base: string, dir = base): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? listFiles(base, path)
      : [relative(base, path).split("\\").join("/")];
  });
}

/** Files of plugins/<name> at a ref in the origin repository, as path -> content. */
function treeAt(ref: string, name: string): Map<string, string> {
  const files = git(origin, ["ls-tree", "-r", "--name-only", ref, `plugins/${name}`])
    .split("\n")
    .filter(Boolean);
  return new Map(files.map((file) => [file, git(origin, ["show", `${ref}:${file}`])]));
}

function sameTree(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([path, content]) => b.get(path) === content);
}

/** User-side catalog: the main-branch catalog, with the GitHub URL swapped for the local remote. */
function writeUserCatalog(dir: string): void {
  const catalog = readJson<Catalog>(catalogPath(workspace));
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeJson(catalogPath(dir), {
    ...catalog,
    name: "cca-release-flow",
    plugins: catalog.plugins.map((entry) => ({
      ...entry,
      source: { ...(entry.source as object), url: pathToFileURL(origin).href },
    })),
  });
}

function installedVersions(env: NodeJS.ProcessEnv): Map<string, string> {
  const listed = runClaude(["plugin", "list", "--json"], { env });
  const items = JSON.parse(listed.stdout) as { id: string; version: string }[];
  return new Map(items.map((item) => [item.id.split("@")[0] ?? "", item.version]));
}

try {
  // A workspace that mirrors this repository, with two plugins whose authors finished the template.
  mkdirSync(workspace);
  for (const file of ["LICENSE", "tsconfig.base.json"])
    cpSync(join(REPO_ROOT, file), join(workspace, file));
  mkdirSync(join(workspace, ".claude-plugin"));
  writeJson(catalogPath(workspace), { ...readJson<Catalog>(catalogPath()), plugins: [] });
  writeFileSync(join(workspace, ".gitignore"), "node_modules/\nout/\n");
  symlinkSync(join(REPO_ROOT, "node_modules"), join(workspace, "node_modules"), "junction");
  for (const name of ["alpha-check", "beta-check"]) {
    const dir = scaffoldPlugin({
      name,
      description: `Release flow self-test plugin ${name}`,
      pluginsRoot,
    });
    for (const file of listFiles(dir)) {
      const path = join(dir, file);
      writeFileSync(
        path,
        readFileSync(path, "utf8")
          .replace(/^.*TEMPLATE-TODO:.*\n/gm, "")
          .replaceAll("TEMPLATE-TODO", "Self-test"),
      );
    }
    must(findTemplateMarkers(dir).length === 0, `${name} still has template markers`);
    await buildPlugin(dir);
  }
  git(root, ["init", "-q", "--bare", "-b", "main", origin]);
  git(workspace, ["init", "-q", "-b", "main"]);
  git(workspace, ["config", "core.autocrlf", "false"]);
  git(workspace, ["remote", "add", "origin", origin]);
  setVersion("alpha-check", "0.1.0");
  setVersion("beta-check", "0.1.0");
  commitAll("first release");
  ok("workspace with two plugins versioned 0.1.0, catalog synced, pushed to a local origin");

  const releaseDir = join(workspace, "out", "release");
  buildReleaseTree({ repoRoot: workspace, outDir: releaseDir });
  const dry = publishRelease({ repoRoot: workspace, dryRun: true, githubReleases: false });
  must(!dry.published && dry.tags.length === 2, "dry run should plan two tags without publishing");
  must(
    git(origin, ["tag", "-l"]) === "" && git(workspace, ["tag", "-l"]) === "",
    "dry run must not create tags",
  );
  must(
    run("git", ["rev-parse", "--verify", "-q", RELEASE_BRANCH], { cwd: workspace }).status !== 0,
    "dry run must not leave a release branch",
  );
  ok("dry run plans both tags and leaves no trace locally or on origin");

  const first = publishRelease({ repoRoot: workspace, githubReleases: false });
  must(
    first.published && first.tags.join(",") === "alpha-check--v0.1.0,beta-check--v0.1.0",
    "first publish tags",
    first.tags.join(","),
  );
  for (const name of ["alpha-check", "beta-check"]) {
    const shipped = new Map(
      listFiles(join(releaseDir, "plugins", name)).map((file) => [
        `plugins/${name}/${file}`,
        readFileSync(join(releaseDir, "plugins", name, file), "utf8").trimEnd(),
      ]),
    );
    must(
      sameTree(treeAt(releaseTag(name, "0.1.0"), name), shipped),
      `${name} tag content differs from the release tree`,
    );
  }
  ok("publish pushes the release branch and two tags whose content equals the release tree");

  const again = publishRelease({ repoRoot: workspace, githubReleases: false });
  must(
    !again.published && again.tags.length === 0,
    "second publish without changes must be a no-op",
  );
  ok("publishing again with nothing new is a no-op");

  const userCatalog = join(root, "user-catalog");
  writeUserCatalog(userCatalog);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: join(root, "user-config") };
  must(
    runClaude(["plugin", "marketplace", "add", userCatalog], { env }).status === 0,
    "user marketplace add failed",
  );
  for (const name of ["alpha-check", "beta-check"]) {
    const installed = runClaude(["plugin", "install", `${name}@cca-release-flow`], { env });
    must(
      installed.status === 0,
      `user install of ${name} failed`,
      installed.stdout + installed.stderr,
    );
  }
  const v1 = installedVersions(env);
  must(
    v1.get("alpha-check") === "0.1.0" && v1.get("beta-check") === "0.1.0",
    "users should get 0.1.0",
    JSON.stringify([...v1]),
  );
  ok("a user installs both plugins from their tags");

  // Second release: alpha changes and is bumped; beta is rebuilt with different output but not bumped.
  const alphaTagSha = git(origin, ["rev-parse", "alpha-check--v0.1.0"]);
  const skill = join(pluginsRoot, "alpha-check", "skills", "example", "SKILL.md");
  appendFileSync(skill, "\nSecond release change.\n");
  appendFileSync(
    join(pluginsRoot, "beta-check", "dist", "session-start.mjs"),
    "\n// rebuilt without a version bump\n",
  );
  setVersion("alpha-check", "0.2.0");
  commitAll("alpha 0.2.0");
  buildReleaseTree({ repoRoot: workspace, outDir: releaseDir });
  const second = publishRelease({ repoRoot: workspace, githubReleases: false });
  must(
    second.published && second.tags.join(",") === "alpha-check--v0.2.0",
    "second publish should tag only alpha",
    second.tags.join(","),
  );
  must(git(origin, ["rev-parse", "alpha-check--v0.1.0"]) === alphaTagSha, "an existing tag moved");
  must(
    sameTree(treeAt(RELEASE_BRANCH, "beta-check"), treeAt("beta-check--v0.1.0", "beta-check")),
    "unbumped beta shipped rebuilt content on the release branch",
  );
  must(
    git(origin, [
      "show",
      `alpha-check--v0.2.0:plugins/alpha-check/skills/example/SKILL.md`,
    ]).includes("Second release change."),
    "alpha 0.2.0 lacks its change",
  );
  must(
    git(origin, ["rev-list", "--count", RELEASE_BRANCH]) === "2",
    "release branch should fast-forward with one commit per release",
  );
  ok(
    "second release tags only the bumped plugin; old tags are unmoved and unbumped content is pinned",
  );

  writeUserCatalog(userCatalog);
  const updatedMarketplace = runClaude(["plugin", "marketplace", "update", "cca-release-flow"], {
    env,
  });
  must(
    updatedMarketplace.status === 0,
    "marketplace update failed",
    updatedMarketplace.stdout + updatedMarketplace.stderr,
  );
  const updated = runClaude(["plugin", "update", "alpha-check@cca-release-flow"], { env });
  must(updated.status === 0, "plugin update failed", updated.stdout + updated.stderr);
  const v2 = installedVersions(env);
  must(
    v2.get("alpha-check") === "0.2.0" && v2.get("beta-check") === "0.1.0",
    "users should get alpha 0.2.0 and keep beta 0.1.0",
    JSON.stringify([...v2]),
  );
  ok("the user updates alpha to 0.2.0 while beta stays at 0.1.0");

  console.log("✔ release flow self-test passed");
} finally {
  if (keep) console.log(`kept ${root}`);
  else rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}

// Publishes the release tree in out/release to the `release` branch and tags every plugin whose
// `<name>--v<version>` tag does not exist yet. Plugins that are already tagged keep exactly their
// tagged content, so the branch head never carries unversioned rebuilds.
//
// Usage: tsx scripts/publish-release.ts [--dry-run]
// Requires: a clean checkout with an `origin` remote, `pnpm build:release` already run, and for a
// real release push access to `release` plus an authenticated `gh` for GitHub Releases.
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fail,
  listPlugins,
  type PluginInfo,
  releaseTag,
  REPO_ROOT,
  run,
  runClaude,
} from "./lib/workspace.js";
import { changelogSection } from "./lib/release.js";

const dryRun = process.argv.includes("--dry-run");
const releaseDir = join(REPO_ROOT, "out", "release");
const BRANCH = "release";

function git(args: string[], cwd = REPO_ROOT): string {
  const result = run("git", args, { cwd });
  if (result.status !== 0) fail(`git ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout.trim();
}

function gitOk(args: string[], cwd = REPO_ROOT): boolean {
  return run("git", args, { cwd }).status === 0;
}

function setOutput(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

if (!existsSync(releaseDir)) fail("out/release is missing; run pnpm build:release first");
const plugins = listPlugins(join(releaseDir, "plugins"));
if (plugins.length === 0) {
  console.log("No released plugins in the catalog; nothing to publish.");
  setOutput("published", "false");
  process.exit(0);
}

git(["fetch", "--quiet", "--tags", "origin"]);
const hasRemoteBranch = gitOk([
  "fetch",
  "--quiet",
  "origin",
  `${BRANCH}:refs/remotes/origin/${BRANCH}`,
]);
const tagExists = (plugin: PluginInfo): boolean =>
  gitOk([
    "rev-parse",
    "-q",
    "--verify",
    `refs/tags/${releaseTag(plugin.name, plugin.packageVersion)}`,
  ]);
const pending = plugins.filter((plugin) => !tagExists(plugin));
if (pending.length === 0) {
  console.log("Every catalog plugin is already tagged; nothing to publish.");
  setOutput("published", "false");
  process.exit(0);
}

const sourceSha = git(["rev-parse", "HEAD"]);
const worktree = mkdtempSync(join(tmpdir(), "cca-release-"));
rmSync(worktree, { recursive: true, force: true });
const createdTags: string[] = [];
try {
  if (hasRemoteBranch) {
    git(["worktree", "add", "--quiet", "-B", BRANCH, worktree, `origin/${BRANCH}`]);
  } else {
    git(["worktree", "add", "--quiet", "--detach", worktree, "HEAD"]);
    git(["checkout", "--quiet", "--orphan", BRANCH], worktree);
  }
  for (const entry of readdirSync(worktree)) {
    if (entry !== ".git") rmSync(join(worktree, entry), { recursive: true, force: true });
  }
  cpSync(releaseDir, worktree, { recursive: true });
  for (const plugin of plugins.filter((candidate) => !pending.includes(candidate))) {
    const tag = releaseTag(plugin.name, plugin.packageVersion);
    rmSync(join(worktree, "plugins", plugin.name), { recursive: true, force: true });
    git(["checkout", tag, "--", `plugins/${plugin.name}`], worktree);
  }
  git(["add", "-A"], worktree);
  const summary = pending.map((plugin) => `${plugin.name}@${plugin.packageVersion}`).join(", ");
  git(
    [
      "-c",
      "user.name=github-actions[bot]",
      "-c",
      "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      `release: ${summary}`,
      "-m",
      `Built from main@${sourceSha}.`,
    ],
    worktree,
  );
  for (const plugin of pending) {
    const tagged = runClaude(
      ["plugin", "tag", join("plugins", plugin.name), "-m", `${plugin.name} %s`],
      {
        cwd: worktree,
        env: {
          ...process.env,
          GIT_COMMITTER_NAME: "github-actions[bot]",
          GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
        },
      },
    );
    if (tagged.status !== 0)
      fail(`claude plugin tag failed for ${plugin.name}:\n${tagged.stdout}${tagged.stderr}`);
    createdTags.push(releaseTag(plugin.name, plugin.packageVersion));
  }
  const releaseSha = git(["rev-parse", "HEAD"], worktree);
  console.log(`Release commit ${releaseSha} on ${BRANCH}: ${summary}`);
  console.log(`Tags: ${createdTags.join(", ")}`);

  if (dryRun) {
    console.log("Dry run: nothing pushed.");
    console.log(git(["show", "--stat", "--oneline", "HEAD"], worktree));
  } else {
    git(["push", "--quiet", "origin", `${BRANCH}:${BRANCH}`], worktree);
    git(["push", "--quiet", "origin", ...createdTags.map((tag) => `refs/tags/${tag}`)], worktree);
    for (const plugin of pending) {
      const tag = releaseTag(plugin.name, plugin.packageVersion);
      const changelogPath = join(REPO_ROOT, "plugins", plugin.name, "CHANGELOG.md");
      const notes = [
        existsSync(changelogPath)
          ? changelogSection(readFileSync(changelogPath, "utf8"), plugin.packageVersion)
          : "",
        `Install: \`/plugin install ${plugin.name}@claude-code-aws\``,
        `Built from main@${sourceSha}; release commit ${releaseSha}.`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const created = run(
        "gh",
        [
          "release",
          "create",
          tag,
          "--verify-tag",
          "--title",
          `${plugin.name} v${plugin.packageVersion}`,
          "--notes",
          notes,
        ],
        {
          cwd: REPO_ROOT,
        },
      );
      if (created.status !== 0) fail(`gh release create ${tag} failed:\n${created.stderr}`);
    }
  }
  setOutput("published", dryRun ? "false" : "true");
  setOutput("plugins", pending.map((plugin) => plugin.name).join(" "));
} finally {
  run("git", ["worktree", "remove", "--force", worktree], { cwd: REPO_ROOT });
  if (dryRun) for (const tag of createdTags) run("git", ["tag", "-d", tag], { cwd: REPO_ROOT });
}

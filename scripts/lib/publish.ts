import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { changelogSection } from "./release.js";
import {
  listPlugins,
  type PluginInfo,
  releaseTag,
  REPO_ROOT,
  run,
  runClaude,
} from "./workspace.js";

export const RELEASE_BRANCH = "release";
const BOT = {
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com",
};

export interface PublishOptions {
  /** Git checkout with an `origin` remote. Defaults to this repository. */
  repoRoot?: string;
  /** Assembled release tree. Defaults to `<repoRoot>/out/release`. */
  releaseDir?: string;
  dryRun?: boolean;
  /** Create GitHub Releases with `gh` after pushing. Off for local self-tests. */
  githubReleases?: boolean;
  log?: (message: string) => void;
}

export interface PublishResult {
  published: boolean;
  /** Plugins that received a new tag (or would, in a dry run). */
  plugins: PluginInfo[];
  tags: string[];
  releaseSha?: string;
}

/**
 * Publishes a release tree to the `release` branch and tags every plugin whose
 * `<name>--v<version>` tag does not exist yet. Plugins that are already tagged keep exactly their
 * tagged content, so the branch head never carries unversioned rebuilds. Idempotent: with nothing
 * pending it changes nothing.
 */
export function publishRelease(options: PublishOptions = {}): PublishResult {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const releaseDir = options.releaseDir ?? join(repoRoot, "out", "release");
  const log = options.log ?? ((): void => undefined);
  const dryRun = options.dryRun === true;

  const git = (args: string[], cwd = repoRoot): string => {
    const result = run("git", args, { cwd });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
    return result.stdout.trim();
  };
  const gitOk = (args: string[], cwd = repoRoot): boolean => run("git", args, { cwd }).status === 0;

  if (!existsSync(releaseDir))
    throw new Error(`${releaseDir} is missing; run pnpm build:release first`);
  const plugins = listPlugins(join(releaseDir, "plugins"));
  if (plugins.length === 0) {
    log("No released plugins in the catalog; nothing to publish.");
    return { published: false, plugins: [], tags: [] };
  }

  git(["fetch", "--quiet", "--tags", "origin"]);
  const hasRemoteBranch = gitOk([
    "fetch",
    "--quiet",
    "origin",
    `+${RELEASE_BRANCH}:refs/remotes/origin/${RELEASE_BRANCH}`,
  ]);
  const tagOf = (plugin: PluginInfo): string => releaseTag(plugin.name, plugin.packageVersion);
  const pending = plugins.filter(
    (plugin) => !gitOk(["rev-parse", "-q", "--verify", `refs/tags/${tagOf(plugin)}`]),
  );
  if (pending.length === 0) {
    log("Every catalog plugin is already tagged; nothing to publish.");
    return { published: false, plugins: [], tags: [] };
  }

  const sourceSha = git(["rev-parse", "HEAD"]);
  const worktree = mkdtempSync(join(tmpdir(), "cca-release-"));
  rmSync(worktree, { recursive: true, force: true });
  const createdTags: string[] = [];
  try {
    if (hasRemoteBranch) {
      git([
        "worktree",
        "add",
        "--quiet",
        "-B",
        RELEASE_BRANCH,
        worktree,
        `origin/${RELEASE_BRANCH}`,
      ]);
    } else {
      git(["worktree", "add", "--quiet", "--detach", worktree, "HEAD"]);
      git(["checkout", "--quiet", "--orphan", RELEASE_BRANCH], worktree);
    }
    for (const entry of readdirSync(worktree)) {
      if (entry !== ".git") rmSync(join(worktree, entry), { recursive: true, force: true });
    }
    cpSync(releaseDir, worktree, { recursive: true });
    for (const plugin of plugins.filter((candidate) => !pending.includes(candidate))) {
      rmSync(join(worktree, "plugins", plugin.name), { recursive: true, force: true });
      git(["checkout", tagOf(plugin), "--", `plugins/${plugin.name}`], worktree);
    }
    git(["add", "-A"], worktree);
    const summary = pending.map((plugin) => `${plugin.name}@${plugin.packageVersion}`).join(", ");
    git(
      [
        "-c",
        `user.name=${BOT.name}`,
        "-c",
        `user.email=${BOT.email}`,
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
      // claude plugin tag checks that plugin.json and the catalog entry agree before tagging.
      const tagged = runClaude(
        ["plugin", "tag", join("plugins", plugin.name), "-m", `${plugin.name} %s`],
        {
          cwd: worktree,
          env: { ...process.env, GIT_COMMITTER_NAME: BOT.name, GIT_COMMITTER_EMAIL: BOT.email },
        },
      );
      if (tagged.status !== 0) {
        throw new Error(
          `claude plugin tag failed for ${plugin.name}:\n${tagged.stdout}${tagged.stderr}`,
        );
      }
      createdTags.push(tagOf(plugin));
    }
    const releaseSha = git(["rev-parse", "HEAD"], worktree);
    log(`Release commit ${releaseSha} on ${RELEASE_BRANCH}: ${summary}`);
    log(`Tags: ${createdTags.join(", ")}`);

    if (dryRun) {
      log("Dry run: nothing pushed.");
      log(git(["show", "--stat", "--oneline", "HEAD"], worktree));
      return { published: false, plugins: pending, tags: createdTags, releaseSha };
    }

    git(["push", "--quiet", "origin", `${RELEASE_BRANCH}:${RELEASE_BRANCH}`], worktree);
    git(["push", "--quiet", "origin", ...createdTags.map((tag) => `refs/tags/${tag}`)], worktree);
    if (options.githubReleases !== false) {
      for (const plugin of pending) {
        const changelogPath = join(repoRoot, "plugins", plugin.name, "CHANGELOG.md");
        const notes = [
          existsSync(changelogPath)
            ? changelogSection(readFileSync(changelogPath, "utf8"), plugin.packageVersion)
            : "",
          `Install: \`/plugin install ${plugin.name}@claude-code-aws\``,
          `Built from main@${sourceSha}; release commit ${releaseSha}.`,
        ]
          .filter(Boolean)
          .join("\n\n");
        const title = `${plugin.name} v${plugin.packageVersion}`;
        const created = run(
          "gh",
          ["release", "create", tagOf(plugin), "--verify-tag", "--title", title, "--notes", notes],
          {
            cwd: repoRoot,
          },
        );
        if (created.status !== 0)
          throw new Error(`gh release create ${tagOf(plugin)} failed:\n${created.stderr}`);
      }
    }
    return { published: true, plugins: pending, tags: createdTags, releaseSha };
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot });
    if (dryRun) {
      // Leave no local trace: the next run recreates the branch from origin/release.
      for (const tag of createdTags) run("git", ["tag", "-d", tag], { cwd: repoRoot });
      run("git", ["branch", "-D", RELEASE_BRANCH], { cwd: repoRoot });
    }
  }
}

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  commonInput,
  runPluginHooks,
  sessionStartInput,
  type CommonHookInput,
} from "../../packages/testkit/src/index.js";
import { type Catalog, listPlugins, releaseTag, run, runClaude, writeJson } from "./workspace.js";

export interface PackagingReport {
  plugin: string;
  checks: { name: string; ok: boolean; detail?: string }[];
}

const TEST_MARKETPLACE = "cca-packaging-test";

function git(cwd: string, args: string[]): void {
  const result = run("git", args, { cwd });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

function claudeJson(
  args: string[],
  env: NodeJS.ProcessEnv,
): { status: number | null; json: unknown; raw: string } {
  const result = runClaude([...args, "--json"], { env });
  const lastLine = result.stdout.trim().split(/\r?\n/).pop() ?? "";
  let json: unknown;
  try {
    json = JSON.parse(
      lastLine.startsWith("[") || lastLine.startsWith("{") ? lastLine : result.stdout,
    );
  } catch {
    json = undefined;
  }
  return { status: result.status, json, raw: `${result.stdout}\n${result.stderr}` };
}

function sampleInput(event: string, cwd: string): CommonHookInput {
  if (event === "SessionStart") return sessionStartInput(cwd);
  if (event === "PreToolUse" || event === "PostToolUse") {
    return {
      ...commonInput(event, cwd),
      tool_name: "Bash",
      tool_input: { command: "echo packaging-test" },
      tool_use_id: "toolu_test",
    };
  }
  return commonInput(event, cwd);
}

/**
 * Installs every plugin of a release tree the way users do: from a git repository, through a
 * marketplace, into Claude Code's plugin cache, under an isolated config directory. No network or
 * Claude authentication is needed.
 */
export async function testPackaging(releaseDir: string): Promise<PackagingReport[]> {
  const plugins = listPlugins(join(releaseDir, "plugins"));
  if (plugins.length === 0) return [];
  const work = mkdtempSync(join(tmpdir(), "cca-packaging-"));
  try {
    const repo = join(work, "release");
    git(work, ["init", "-q", "-b", "release", repo]);
    git(repo, ["config", "core.autocrlf", "false"]);
    cpSync(releaseDir, repo, { recursive: true });
    git(repo, ["add", "-A"]);
    git(repo, [
      "-c",
      "user.name=packaging-test",
      "-c",
      "user.email=packaging@test.invalid",
      "commit",
      "-q",
      "-m",
      "release",
    ]);
    for (const plugin of plugins)
      git(repo, ["tag", releaseTag(plugin.name, plugin.packageVersion)]);
    const bare = join(work, "release.git");
    git(work, ["clone", "-q", "--bare", repo, bare]);

    const catalogDir = join(work, "catalog");
    mkdirSync(join(catalogDir, ".claude-plugin"), { recursive: true });
    const catalog: Catalog = {
      name: TEST_MARKETPLACE,
      description: "Packaging test catalog",
      owner: { name: "packaging-test" },
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        description: plugin.manifest.description ?? "",
        source: {
          source: "git-subdir",
          url: pathToFileURL(bare).href,
          path: `plugins/${plugin.name}`,
          ref: releaseTag(plugin.name, plugin.packageVersion),
        },
      })),
    };
    writeJson(join(catalogDir, ".claude-plugin", "marketplace.json"), catalog);

    const configDir = join(work, "claude-config");
    const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
    const added = claudeJson(["plugin", "marketplace", "add", catalogDir], env);
    if (added.status !== 0) throw new Error(`marketplace add failed: ${added.raw}`);

    const reports: PackagingReport[] = [];
    for (const plugin of plugins) {
      const id = `${plugin.name}@${TEST_MARKETPLACE}`;
      const report: PackagingReport = { plugin: plugin.name, checks: [] };
      const check = (name: string, ok: boolean, detail?: string): void => {
        report.checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
      };
      reports.push(report);

      const installed = claudeJson(["plugin", "install", id], env);
      check(
        "install from git cache",
        installed.status === 0,
        installed.status === 0 ? undefined : installed.raw,
      );
      if (installed.status !== 0) continue;

      const listed = claudeJson(["plugin", "list"], env);
      const record = (Array.isArray(listed.json) ? listed.json : []).find(
        (item: { id?: string }) => item.id === id,
      ) as
        { enabled?: boolean; version?: string; installPath?: string; errors?: unknown } | undefined;
      check("listed and enabled", record?.enabled === true, JSON.stringify(record));
      check("installed version", record?.version === plugin.packageVersion, record?.version);
      const installPath = record?.installPath ?? "";
      check(
        "installed outside the source tree",
        installPath !== "" && !installPath.startsWith(releaseDir),
        installPath,
      );

      const details = runClaude(["plugin", "details", id], { env });
      check(
        "details load without errors",
        details.status === 0 && !/error/i.test(details.stdout),
        details.stdout,
      );

      if (existsSync(join(installPath, "hooks", "hooks.json"))) {
        const hooksFile = JSON.parse(
          readFileSync(join(installPath, "hooks", "hooks.json"), "utf8"),
        ) as {
          hooks?: Record<string, unknown>;
          modules?: string[];
        };
        const events = Object.keys(hooksFile.hooks ?? {});
        const projectDir = mkdtempSync(join(work, "project-"));
        for (const event of events) {
          try {
            // Hooks run with an isolated home and no instance metadata (see the testkit), so
            // packaging never reads the developer's AWS profiles or calls AWS.
            const results = await runPluginHooks(sampleInput(event, projectDir), {
              pluginRoot: installPath,
              projectDir,
            });
            const bad = results.filter(
              (result) =>
                result.exitCode !== 0 || result.timedOut || result.secretFindings.length > 0,
            );
            check(
              `${event} hooks run from cache`,
              bad.length === 0,
              bad.map((result) => result.stderr).join("\n") || undefined,
            );
          } catch (error) {
            check(`${event} hooks run from cache`, false, String(error));
          }
        }
        // A mod: its hooks module must exist in the cache and pass validation from there.
        const modules = hooksFile.modules ?? [];
        if (modules.length > 0) {
          const present = modules.every((path) => existsSync(join(installPath, "hooks", path)));
          check("mod hooks module is present in the cache", present, modules.join(", "));
          const validated = runClaude(["plugin", "validate", installPath], { env });
          check(
            "mod validates from the cache",
            validated.status === 0,
            validated.stdout + validated.stderr,
          );
        }
      }

      const disabled = claudeJson(["plugin", "disable", id], env);
      const enabled = claudeJson(["plugin", "enable", id], env);
      check(
        "disable and enable",
        disabled.status === 0 && enabled.status === 0,
        `${disabled.raw}\n${enabled.raw}`,
      );

      const dataRoot = join(configDir, "plugins", "data");
      const uninstalled = claudeJson(["plugin", "uninstall", id], env);
      check("uninstall", uninstalled.status === 0, uninstalled.raw);
      const leftovers = existsSync(dataRoot)
        ? readdirSync(dataRoot).filter((dir) => dir.startsWith(plugin.name))
        : [];
      check(
        "plugin data removed on uninstall",
        leftovers.length === 0,
        leftovers.join(", ") || undefined,
      );
    }
    return reports;
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 3 });
  }
}

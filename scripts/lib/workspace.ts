import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GITHUB_REPO = "Alejo2075/claude-code-aws";
export const MARKETPLACE_NAME = "claude-code-aws";
/** Version a scaffolded plugin starts at; it is not released until a changeset bumps it. */
export const UNRELEASED_VERSION = "0.0.0";

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  displayName?: string;
  keywords?: string[];
  license?: string;
  homepage?: string;
  [key: string]: unknown;
}

export interface CatalogEntry {
  name: string;
  source:
    | string
    | { source: string; url?: string; path?: string; ref?: string; sha?: string; repo?: string };
  description?: string;
  version?: string;
  [key: string]: unknown;
}

export interface Catalog {
  name: string;
  description?: string;
  owner: { name: string; email?: string; url?: string };
  plugins: CatalogEntry[];
  [key: string]: unknown;
}

export interface PluginInfo {
  name: string;
  dir: string;
  manifest: PluginManifest;
  packageVersion: string;
  packageName: string;
}

// The type parameter documents the caller's expected shape; JSON input is not validated.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function catalogPath(root: string = REPO_ROOT): string {
  return join(root, ".claude-plugin", "marketplace.json");
}

export function listPlugins(pluginsRoot: string = join(REPO_ROOT, "plugins")): PluginInfo[] {
  if (!existsSync(pluginsRoot)) return [];
  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(pluginsRoot, entry.name, ".claude-plugin", "plugin.json")),
    )
    .map((entry) => {
      const dir = join(pluginsRoot, entry.name);
      const manifest = readJson<PluginManifest>(join(dir, ".claude-plugin", "plugin.json"));
      // Release trees ship without package.json; plugin.json then carries the version.
      const pkgPath = join(dir, "package.json");
      const pkg = existsSync(pkgPath)
        ? readJson<{ name: string; version: string }>(pkgPath)
        : { name: manifest.name, version: manifest.version ?? UNRELEASED_VERSION };
      return {
        name: entry.name,
        dir,
        manifest,
        packageVersion: pkg.version,
        packageName: pkg.name,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isReleased(plugin: PluginInfo): boolean {
  return plugin.packageVersion !== UNRELEASED_VERSION;
}

export function releaseTag(name: string, version: string): string {
  return `${name}--v${version}`;
}

export function catalogEntryFor(plugin: PluginInfo): CatalogEntry {
  const { manifest } = plugin;
  const entry: CatalogEntry = {
    name: plugin.name,
    description: manifest.description ?? "",
    source: {
      source: "git-subdir",
      url: GITHUB_REPO,
      path: `plugins/${plugin.name}`,
      ref: releaseTag(plugin.name, plugin.packageVersion),
    },
  };
  // Only entry fields are visible before install for non-relative sources, so mirror display data.
  for (const key of ["displayName", "keywords", "license", "homepage"] as const) {
    if (manifest[key] !== undefined) entry[key] = manifest[key];
  }
  return entry;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

let claudeExecutable: { command: string; shell: boolean } | undefined;

/** Resolves the claude CLI so it can be spawned without a shell on every platform where possible. */
export function claudeCli(): { command: string; shell: boolean } {
  if (claudeExecutable) return claudeExecutable;
  if (process.platform !== "win32") return (claudeExecutable = { command: "claude", shell: false });
  const where = spawnSync("where", ["claude"], { encoding: "utf8" });
  const candidates = where.stdout.split(/\r?\n/).filter(Boolean);
  const exe = candidates.find((candidate) => candidate.toLowerCase().endsWith(".exe"));
  claudeExecutable = exe
    ? { command: exe, shell: false }
    : { command: candidates[0] ?? "claude", shell: true };
  return claudeExecutable;
}

export function run(
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions = {},
): RunResult {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

export function runClaude(args: readonly string[], options: SpawnSyncOptions = {}): RunResult {
  const cli = claudeCli();
  const quoted = cli.shell
    ? args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg))
    : args;
  return run(cli.command, quoted, { shell: cli.shell, ...options });
}

export function fail(message: string): never {
  console.error(`✘ ${message}`);
  process.exit(1);
}

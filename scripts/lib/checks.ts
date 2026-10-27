import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  type Catalog,
  type CatalogEntry,
  catalogEntryFor,
  isReleased,
  type PluginInfo,
} from "./workspace.js";

const PLUGIN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_PREFIX = /^(?:claude|anthropic|anthropics|cc-plugin)-/;

export function checkPluginName(name: string): string | undefined {
  if (!PLUGIN_NAME.test(name)) return `plugin name "${name}" must be kebab-case (a-z, 0-9, -)`;
  if (RESERVED_PREFIX.test(name) || /\b(?:claude|anthropic)\b/.test(name.replace(/-/g, " "))) {
    return `plugin name "${name}" uses a word reserved by Claude Code plugin naming rules`;
  }
  return undefined;
}

/** Consistency rules between workspace plugins and the marketplace catalog. */
export function checkVersions(plugins: readonly PluginInfo[], catalog: Catalog): string[] {
  const errors: string[] = [];
  const byName = new Map(catalog.plugins.map((entry) => [entry.name, entry]));
  for (const plugin of plugins) {
    const nameError = checkPluginName(plugin.name);
    if (nameError) errors.push(nameError);
    if (plugin.manifest.name !== plugin.name) {
      errors.push(
        `${plugin.name}: plugin.json name "${plugin.manifest.name}" must equal the directory name`,
      );
    }
    if (plugin.packageName !== plugin.name) {
      errors.push(
        `${plugin.name}: package.json name "${plugin.packageName}" must equal the directory name`,
      );
    }
    if (plugin.manifest.version !== plugin.packageVersion) {
      errors.push(
        `${plugin.name}: plugin.json version ${String(plugin.manifest.version)} != package.json version ${plugin.packageVersion} (run pnpm version-packages)`,
      );
    }
    const entry = byName.get(plugin.name);
    if (isReleased(plugin) && entry === undefined) {
      errors.push(
        `${plugin.name}: version ${plugin.packageVersion} is released but has no catalog entry`,
      );
    }
    if (!isReleased(plugin) && entry !== undefined) {
      errors.push(`${plugin.name}: unreleased (0.0.0) plugins must not be listed in the catalog`);
    }
    if (entry !== undefined && isReleased(plugin)) {
      const expected = catalogEntryFor(plugin).source;
      if (JSON.stringify(entry.source) !== JSON.stringify(expected)) {
        errors.push(`${plugin.name}: catalog source must be ${JSON.stringify(expected)}`);
      }
    }
  }
  const known = new Set(plugins.map((plugin) => plugin.name));
  for (const entry of catalog.plugins) {
    if (entry.version !== undefined) {
      errors.push(
        `${entry.name}: catalog entries must not set "version"; plugin.json is the source of truth`,
      );
    }
    if (!known.has(entry.name))
      errors.push(`${entry.name}: catalog entry has no plugins/${entry.name} directory`);
  }
  return errors;
}

/** Rebuilds catalog entries from released plugins, preserving unknown top-level catalog fields. */
export function syncCatalog(plugins: readonly PluginInfo[], catalog: Catalog): Catalog {
  const previous = new Map(catalog.plugins.map((entry) => [entry.name, entry]));
  const entries: CatalogEntry[] = plugins.filter(isReleased).map((plugin) => {
    const generated = catalogEntryFor(plugin);
    const existing = previous.get(plugin.name);
    // Keep curated fields such as category or tags, but always regenerate source and display data.
    return existing ? { ...existing, ...generated } : generated;
  });
  return { ...catalog, plugins: entries };
}

export const TEMPLATE_MARKERS = ["TEMPLATE-TODO", "__PLUGIN_NAME__", "__PLUGIN_DESCRIPTION__"];
const SKIPPED_DIRS = new Set(["node_modules", "dist", ".git"]);

export function findTemplateMarkers(dir: string): string[] {
  const hits: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (SKIPPED_DIRS.has(entry)) continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const text = readFileSync(path, "utf8");
      for (const marker of TEMPLATE_MARKERS) {
        if (text.includes(marker)) hits.push(`${relative(dir, path)}: ${marker}`);
      }
    }
  };
  walk(dir);
  return hits;
}

/** Package names a changeset file bumps, read from its frontmatter. */
export function parseChangesetPackages(text: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match?.[1]) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) =>
      /^\s*["']?([^"':]+)["']?\s*:\s*(?:major|minor|patch)\s*$/.exec(line)?.[1]?.trim(),
    )
    .filter((name): name is string => name !== undefined);
}

/**
 * Whether a changed file under a plugin affects what users install: release-tree content, or
 * sources bundled into dist/. Tests, evals, and generated changelogs do not need a changeset.
 */
export function isShippedPluginPath(pathInPlugin: string): boolean {
  const [top] = pathInPlugin.split("/");
  return (
    !["test", "evals", "CHANGELOG.md", "tsconfig.json"].includes(top ?? "") &&
    !pathInPlugin.endsWith(".test.ts")
  );
}

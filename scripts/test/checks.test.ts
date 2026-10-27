import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkPluginName,
  checkVersions,
  findTemplateMarkers,
  isShippedPluginPath,
  parseChangesetPackages,
  syncCatalog,
} from "../lib/checks.js";
import type { Catalog, PluginInfo } from "../lib/workspace.js";

function plugin(name: string, version: string, manifestVersion = version): PluginInfo {
  return {
    name,
    dir: `/repo/plugins/${name}`,
    packageName: name,
    packageVersion: version,
    manifest: { name, version: manifestVersion, description: `${name} plugin`, license: "MIT" },
  };
}

const emptyCatalog: Catalog = { name: "claude-code-aws", owner: { name: "Owner" }, plugins: [] };

describe("checkPluginName", () => {
  it.each(["context", "cdk-review", "a1"])("accepts %s", (name) => {
    expect(checkPluginName(name)).toBeUndefined();
  });

  it.each(["Context", "cdk_review", "claude-tools", "anthropic-x", "tools-for-claude", "-x"])(
    "rejects %s",
    (name) => {
      expect(checkPluginName(name)).toBeDefined();
    },
  );
});

describe("checkVersions", () => {
  it("accepts an unreleased plugin outside the catalog", () => {
    expect(checkVersions([plugin("draft", "0.0.0")], emptyCatalog)).toEqual([]);
  });

  it("requires a catalog entry once released, and accepts the synced one", () => {
    const released = [plugin("ctx", "0.1.0")];
    expect(checkVersions(released, emptyCatalog)).toEqual([
      expect.stringContaining("no catalog entry"),
    ]);
    expect(checkVersions(released, syncCatalog(released, emptyCatalog))).toEqual([]);
  });

  it("flags plugin.json and package.json version drift", () => {
    const errors = checkVersions([plugin("ctx", "0.2.0", "0.1.0")], emptyCatalog);
    expect(errors.some((error) => error.includes("plugin.json version 0.1.0"))).toBe(true);
  });

  it("flags stale catalog refs, catalog versions, and orphan entries", () => {
    const stale = syncCatalog([plugin("ctx", "0.1.0")], emptyCatalog);
    const errors = checkVersions([plugin("ctx", "0.2.0")], {
      ...stale,
      plugins: [
        ...stale.plugins.map((entry) => ({ ...entry, version: "0.1.0" })),
        { name: "ghost", source: "./plugins/ghost" },
      ],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("catalog source must be"),
        expect.stringContaining('must not set "version"'),
        expect.stringContaining("ghost: catalog entry has no plugins/ghost directory"),
      ]),
    );
  });

  it("rejects listing an unreleased plugin", () => {
    const catalog = syncCatalog([plugin("ctx", "0.1.0")], emptyCatalog);
    expect(checkVersions([plugin("ctx", "0.0.0")], catalog)).toEqual(
      expect.arrayContaining([expect.stringContaining("must not be listed")]),
    );
  });
});

describe("syncCatalog", () => {
  it("pins git-subdir sources to release tags and keeps curated fields", () => {
    const first = syncCatalog([plugin("ctx", "0.1.0")], emptyCatalog);
    const curated: Catalog = {
      ...first,
      plugins: first.plugins.map((entry) => ({ ...entry, category: "aws" })),
    };
    const next = syncCatalog([plugin("ctx", "0.2.0"), plugin("draft", "0.0.0")], curated);
    expect(next.plugins).toEqual([
      expect.objectContaining({
        name: "ctx",
        category: "aws",
        source: {
          source: "git-subdir",
          url: "Alejo2075/claude-code-aws",
          path: "plugins/ctx",
          ref: "ctx--v0.2.0",
        },
      }),
    ]);
  });
});

describe("parseChangesetPackages", () => {
  it("reads package bumps from frontmatter", () => {
    const text = '---\n"ctx": minor\ncdk: patch\n---\n\nAdd context detection.\n';
    expect(parseChangesetPackages(text)).toEqual(["ctx", "cdk"]);
  });

  it("returns nothing for empty changesets", () => {
    expect(parseChangesetPackages("---\n---\n\nDocs only.\n")).toEqual([]);
  });
});

describe("isShippedPluginPath", () => {
  it.each([
    ["src/entries/hook.ts", true],
    ["skills/review/SKILL.md", true],
    ["hooks/hooks.json", true],
    ["test/hook.test.ts", false],
    ["evals/smoke/prompt.md", false],
    ["CHANGELOG.md", false],
  ])("%s -> %s", (path, expected) => {
    expect(isShippedPluginPath(path)).toBe(expected);
  });
});

describe("findTemplateMarkers", () => {
  it("finds markers outside dist and node_modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "markers-"));
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "README.md"), "TEMPLATE-TODO fill me");
    writeFileSync(join(dir, "dist", "x.mjs"), "TEMPLATE-TODO");
    expect(findTemplateMarkers(dir)).toEqual(["README.md: TEMPLATE-TODO"]);
  });
});

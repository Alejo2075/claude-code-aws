import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildReleaseTree, changelogSection } from "../lib/release.js";
import { scaffoldPlugin } from "../lib/scaffold.js";
import { type Catalog, catalogPath, readJson, writeJson } from "../lib/workspace.js";

const CHANGELOG = `# ctx

## 0.2.0

### Minor Changes

- abc123: Detect SAM projects.

## 0.1.0

### Minor Changes

- def456: First release.
`;

describe("changelogSection", () => {
  it("returns only the requested version's notes", () => {
    expect(changelogSection(CHANGELOG, "0.2.0")).toBe(
      "### Minor Changes\n\n- abc123: Detect SAM projects.",
    );
    expect(changelogSection(CHANGELOG, "0.1.0")).toBe(
      "### Minor Changes\n\n- def456: First release.",
    );
  });

  it("returns an empty string for unknown versions", () => {
    expect(changelogSection(CHANGELOG, "9.9.9")).toBe("");
  });
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "release-ws-"));
  writeFileSync(join(root, "LICENSE"), "MIT");
  mkdirSync(join(root, ".claude-plugin"));
  writeJson(catalogPath(root), {
    name: "claude-code-aws",
    owner: { name: "Owner" },
    plugins: [],
  } satisfies Catalog);
  return root;
}

function release(dir: string, version: string): void {
  for (const file of ["package.json", join(".claude-plugin", "plugin.json")]) {
    const path = join(dir, file);
    writeJson(path, { ...readJson<Record<string, unknown>>(path), version });
  }
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "session-start.mjs"), "");
}

describe("buildReleaseTree", () => {
  it("omits unreleased plugins", () => {
    const root = workspace();
    scaffoldPlugin({
      name: "draft",
      description: "Draft plugin",
      pluginsRoot: join(root, "plugins"),
    });
    const tree = buildReleaseTree({ repoRoot: root, outDir: join(root, "out") });
    expect(tree.plugins).toEqual([]);
  });

  it("refuses released plugins that still contain template markers", () => {
    const root = workspace();
    const dir = scaffoldPlugin({
      name: "ctx",
      description: "Context plugin",
      pluginsRoot: join(root, "plugins"),
    });
    release(dir, "0.1.0");
    expect(() => buildReleaseTree({ repoRoot: root, outDir: join(root, "out") })).toThrow(
      /template marker/,
    );
  });

  it("copies only shipped files and uses relative catalog sources", () => {
    const root = workspace();
    const dir = scaffoldPlugin({
      name: "ctx",
      description: "Context plugin",
      pluginsRoot: join(root, "plugins"),
    });
    release(dir, "0.1.0");
    const out = join(root, "out");
    buildReleaseTree({ repoRoot: root, outDir: out, selfTest: true });
    const shipped = join(out, "plugins", "ctx");
    for (const kept of [
      ".claude-plugin/plugin.json",
      "dist/session-start.mjs",
      "hooks/hooks.json",
      "skills",
      "LICENSE",
    ]) {
      expect(existsSync(join(shipped, kept)), kept).toBe(true);
    }
    for (const dropped of ["src", "test", "evals", "package.json", "tsconfig.json"]) {
      expect(existsSync(join(shipped, dropped)), dropped).toBe(false);
    }
    expect(readJson<Catalog>(catalogPath(out)).plugins).toEqual([
      expect.objectContaining({ name: "ctx", source: "./plugins/ctx" }),
    ]);
  });
});

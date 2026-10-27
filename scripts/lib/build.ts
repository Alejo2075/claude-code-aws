import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { build } from "esbuild";

/** Lowest Node.js major version plugin executables support. Keep in sync with hook-runtime.ts. */
export const NODE_TARGET = "node22";

/**
 * Bundles every `src/entries/*.ts` file of a plugin into a self-contained `dist/<name>.mjs`.
 * Bundles carry no runtime node_modules, so a plugin works from Claude Code's plugin cache.
 */
export async function buildPlugin(pluginDir: string): Promise<string[]> {
  const entriesDir = join(pluginDir, "src", "entries");
  const outdir = join(pluginDir, "dist");
  rmSync(outdir, { recursive: true, force: true });
  if (!existsSync(entriesDir)) return [];
  const entryPoints = readdirSync(entriesDir)
    .filter((file) => extname(file) === ".ts" && !file.endsWith(".test.ts"))
    .map((file) => join(entriesDir, file));
  if (entryPoints.length === 0) return [];
  await build({
    entryPoints,
    outdir,
    bundle: true,
    platform: "node",
    format: "esm",
    target: NODE_TARGET,
    outExtension: { ".js": ".mjs" },
    legalComments: "linked",
    logLevel: "warning",
    // Some bundled CommonJS dependencies call require(); give ESM bundles a working one.
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });
  return entryPoints.map((entry) => join(outdir, `${basename(entry, ".ts")}.mjs`));
}

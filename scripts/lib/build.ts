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
  const outputs: string[] = [];
  const entryPoints = existsSync(entriesDir)
    ? readdirSync(entriesDir)
        .filter((file) => extname(file) === ".ts" && !file.endsWith(".test.ts"))
        .map((file) => join(entriesDir, file))
    : [];
  if (entryPoints.length > 0) {
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
    outputs.push(...entryPoints.map((entry) => join(outdir, `${basename(entry, ".ts")}.mjs`)));
  }
  outputs.push(...(await buildMod(pluginDir, outdir)));
  return outputs;
}

/** The hooks module of a mod: `src/mod/register.ts` becomes `dist/register.js`. */
export const MOD_SOURCE = join("src", "mod", "register.ts");

/**
 * A mod's hooks module runs inside Claude Code, which gives it no Node APIs and lets it import only
 * files in the plugin. It is bundled as platform-neutral ESM and deliberately not minified:
 * `claude plugin validate` reads `$.namespace.method` calls from the source, so `$` must keep its name.
 */
async function buildMod(pluginDir: string, outdir: string): Promise<string[]> {
  const entry = join(pluginDir, MOD_SOURCE);
  if (!existsSync(entry)) return [];
  await build({
    entryPoints: [entry],
    outfile: join(outdir, "register.js"),
    bundle: true,
    platform: "neutral",
    format: "esm",
    target: "es2022",
    minify: false,
    legalComments: "none",
    logLevel: "warning",
  });
  return [join(outdir, "register.js")];
}

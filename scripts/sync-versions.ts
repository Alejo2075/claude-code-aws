// Runs after `changeset version`: copies each plugin's package.json version into its
// plugin.json and regenerates catalog entries so they point at the next release tags.
import { join } from "node:path";

import { syncCatalog } from "./lib/checks.js";
import {
  type Catalog,
  catalogPath,
  listPlugins,
  type PluginManifest,
  readJson,
  writeJson,
} from "./lib/workspace.js";

for (const plugin of listPlugins()) {
  const manifestPath = join(plugin.dir, ".claude-plugin", "plugin.json");
  const manifest = readJson<PluginManifest>(manifestPath);
  if (manifest.version !== plugin.packageVersion) {
    writeJson(manifestPath, { ...manifest, version: plugin.packageVersion });
    console.log(`${plugin.name}: plugin.json version -> ${plugin.packageVersion}`);
  }
}

writeJson(catalogPath(), syncCatalog(listPlugins(), readJson<Catalog>(catalogPath())));
console.log("catalog entries synchronized");

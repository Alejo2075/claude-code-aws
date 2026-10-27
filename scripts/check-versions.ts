import { checkVersions } from "./lib/checks.js";
import { type Catalog, catalogPath, fail, listPlugins, readJson } from "./lib/workspace.js";

const errors = checkVersions(listPlugins(), readJson<Catalog>(catalogPath()));
if (errors.length > 0) fail(`version and catalog checks failed:\n  ${errors.join("\n  ")}`);
console.log("✔ plugin versions, names, and catalog entries are consistent");

// Released plugins (version other than 0.0.0) must not contain scaffold placeholders.
import { findTemplateMarkers } from "./lib/checks.js";
import { fail, isReleased, listPlugins } from "./lib/workspace.js";

const hits = listPlugins()
  .filter(isReleased)
  .flatMap((plugin) => findTemplateMarkers(plugin.dir).map((hit) => `${plugin.name}/${hit}`));
if (hits.length > 0) fail(`released plugins contain template markers:\n  ${hits.join("\n  ")}`);
console.log("✔ no template markers in released plugins");

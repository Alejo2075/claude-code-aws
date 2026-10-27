// Released plugins (version other than 0.0.0) must not contain scaffold placeholders.
// Pass --all to also list markers in unreleased plugins while authoring.
import { findTemplateMarkers } from "./lib/checks.js";
import { fail, isReleased, listPlugins } from "./lib/workspace.js";

const all = process.argv.includes("--all");
const hits = listPlugins()
  .filter((plugin) => all || isReleased(plugin))
  .flatMap((plugin) => findTemplateMarkers(plugin.dir).map((hit) => `${plugin.name}/${hit}`));
if (hits.length > 0) {
  fail(`${all ? "plugins" : "released plugins"} contain template markers:\n  ${hits.join("\n  ")}`);
}
console.log(`✔ no template markers in ${all ? "any" : "released"} plugins`);

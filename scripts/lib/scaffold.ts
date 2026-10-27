import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkPluginName } from "./checks.js";
import { REPO_ROOT } from "./workspace.js";

export interface ScaffoldOptions {
  name: string;
  description: string;
  pluginsRoot?: string;
  templateDir?: string;
}

function replaceInTree(dir: string, replacements: Record<string, string>): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      replaceInTree(path, replacements);
      continue;
    }
    let text = readFileSync(path, "utf8");
    for (const [token, value] of Object.entries(replacements)) text = text.split(token).join(value);
    writeFileSync(path, text);
  }
}

export function scaffoldPlugin(options: ScaffoldOptions): string {
  const nameError = checkPluginName(options.name);
  if (nameError) throw new Error(nameError);
  if (options.description.trim().length === 0 || /["\\\n]/.test(options.description)) {
    throw new Error("description must be a non-empty single line without quotes or backslashes");
  }
  const pluginsRoot = options.pluginsRoot ?? join(REPO_ROOT, "plugins");
  const target = join(pluginsRoot, options.name);
  if (existsSync(target)) throw new Error(`${target} already exists`);
  cpSync(options.templateDir ?? join(REPO_ROOT, "templates", "plugin"), target, {
    recursive: true,
  });
  replaceInTree(target, {
    __PLUGIN_NAME__: options.name,
    __PLUGIN_DESCRIPTION__: options.description,
  });
  return target;
}

import {
  closeSync,
  cpSync,
  existsSync,
  ftruncateSync,
  openSync,
  readdirSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { checkPluginName } from "./checks.js";
import { REPO_ROOT } from "./workspace.js";

export interface ScaffoldOptions {
  name: string;
  description: string;
  pluginsRoot?: string;
  templateDir?: string;
}

function replaceInTree(dir: string, replacements: Record<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      replaceInTree(path, replacements);
      continue;
    }
    // One descriptor for the read and the write: nothing can swap the file in between.
    const fd = openSync(path, "r+");
    try {
      let text = readFileSync(fd, "utf8");
      for (const [token, value] of Object.entries(replacements))
        text = text.split(token).join(value);
      ftruncateSync(fd, 0);
      writeSync(fd, text, 0);
    } finally {
      closeSync(fd);
    }
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
  let workspaceRoot = dirname(pluginsRoot);
  while (!existsSync(join(workspaceRoot, "tsconfig.base.json"))) {
    const parent = dirname(workspaceRoot);
    if (parent === workspaceRoot) {
      workspaceRoot = REPO_ROOT;
      break;
    }
    workspaceRoot = parent;
  }
  replaceInTree(target, {
    __PLUGIN_NAME__: options.name,
    __PLUGIN_DESCRIPTION__: options.description,
    __WORKSPACE_ROOT_RELATIVE__: relative(target, workspaceRoot).split(sep).join("/"),
  });
  return target;
}

// Node-only: reading templates from disk. Imported as `@claude-code-aws/template-analysis/node`.
import { readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

import { readTextBounded } from "@claude-code-aws/context-contract/node";
import {
  MAX_TEMPLATE_BYTES,
  parseTemplate,
  type Template,
} from "@claude-code-aws/template-analysis";
import { isInside } from "@claude-code-aws/tool-runner";

export interface LoadedStack {
  name: string;
  file: string;
  template: Template;
}

export interface LoadResult {
  stacks: LoadedStack[];
  /** Things that could not be read, each a plain sentence. */
  problems: string[];
}

const MAX_STACKS = 100;
const TEMPLATE_SUFFIX = ".template.json";

function readTemplate(file: string, name: string, result: LoadResult): void {
  const read = readTextBounded(file, MAX_TEMPLATE_BYTES);
  if (read.kind !== "ok") {
    result.problems.push(`${name}: the template file could not be read (${read.kind}).`);
    return;
  }
  const parsed = parseTemplate(read.text);
  if (!parsed.ok) {
    result.problems.push(`${name}: ${parsed.error}.`);
    return;
  }
  result.stacks.push({ name, file, template: parsed.template });
}

/** The stack artifacts of a `cdk.out/manifest.json`: name and template file name. */
function manifestStacks(manifestText: string): Array<{ name: string; templateFile: string }> {
  try {
    const manifest: unknown = JSON.parse(manifestText);
    const artifacts = (
      manifest as {
        artifacts?: Record<string, { type?: unknown; properties?: { templateFile?: unknown } }>;
      }
    ).artifacts;
    if (artifacts === undefined || typeof artifacts !== "object") return [];
    return Object.entries(artifacts)
      .filter(
        ([, artifact]) =>
          artifact.type === "aws:cloudformation:stack" &&
          typeof artifact.properties?.templateFile === "string",
      )
      .map(([name, artifact]) => ({
        name,
        templateFile: artifact.properties?.templateFile as string,
      }));
  } catch {
    return [];
  }
}

/**
 * Loads CloudFormation templates from a `cdk.out` directory (using its manifest, else every
 * `*.template.json`) or from a single template file. The path must be inside the project.
 */
export function loadStacks(root: string, path: string): LoadResult {
  const result: LoadResult = { stacks: [], problems: [] };
  const target = isAbsolute(path) ? path : resolve(root, path);
  if (!isInside(root, target)) {
    result.problems.push("The path is outside the project, so it was not read.");
    return result;
  }
  let info;
  try {
    info = statSync(target);
  } catch {
    result.problems.push(
      `${path} does not exist. Run \`synth\` first, or give the path of a cdk.out directory or a template.`,
    );
    return result;
  }
  if (info.isFile()) {
    const name = basename(target).replace(/(\.template)?\.json$/, "");
    readTemplate(target, name, result);
    return result;
  }
  const seen = new Set<string>();
  const manifest = readTextBounded(join(target, "manifest.json"), 4 * 1024 * 1024);
  if (manifest.kind === "ok") {
    for (const { name, templateFile } of manifestStacks(manifest.text)) {
      if (templateFile !== basename(templateFile)) {
        result.problems.push(
          `${name}: the manifest names a template outside the directory; skipped.`,
        );
        continue;
      }
      seen.add(templateFile);
      if (result.stacks.length < MAX_STACKS) readTemplate(join(target, templateFile), name, result);
    }
  }
  let files: string[] = [];
  try {
    files = readdirSync(target)
      .filter((file) => file.endsWith(TEMPLATE_SUFFIX) && !seen.has(file))
      .sort();
  } catch {
    // The directory vanished between the checks.
  }
  for (const file of files) {
    if (result.stacks.length >= MAX_STACKS) {
      result.problems.push(`More than ${MAX_STACKS} templates; the rest were skipped.`);
      break;
    }
    readTemplate(join(target, file), file.slice(0, -TEMPLATE_SUFFIX.length), result);
  }
  if (result.stacks.length === 0 && result.problems.length === 0) {
    result.problems.push(`No CloudFormation templates were found in ${path}.`);
  }
  return result;
}

import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { claudeConfigDir, type EnvReader } from "@claude-code-aws/context-contract";
import { readTextBounded } from "@claude-code-aws/context-contract/node";

const SCRIPT_LIMIT = 1_000_000;

/** The stable copy lives in this plugin's own folder under the Claude config directory. */
export function stableScriptPath(env: EnvReader): string | null {
  const base = claudeConfigDir(env);
  return base === null ? null : `${base}/aws-ui/statusline.mjs`;
}

export interface ExistingStatusLine {
  /** True when ~/.claude/settings.json already sets a statusLine. Nothing else is read or kept. */
  isConfigured: boolean;
  /** The configured command, which is the user's own text and not a secret. Null when absent. */
  command: string | null;
}

/** Reads one key of the user's settings. The rest of the file (which may hold secrets) is dropped. */
export function detectStatusLine(env: EnvReader): ExistingStatusLine {
  const base = claudeConfigDir(env);
  if (base === null) return { isConfigured: false, command: null };
  const path = `${base}/settings.json`;
  const read = readTextBounded(path, 1_000_000);
  if (read.kind !== "ok") return { isConfigured: false, command: null };
  try {
    const settings: unknown = JSON.parse(read.text);
    const line =
      typeof settings === "object" && settings !== null
        ? (settings as Record<string, unknown>)["statusLine"]
        : undefined;
    if (typeof line !== "object" || line === null) return { isConfigured: false, command: null };
    const command = (line as Record<string, unknown>)["command"];
    return { isConfigured: true, command: typeof command === "string" ? command : null };
  } catch {
    return { isConfigured: false, command: null };
  }
}

/** Settings snippet with forward slashes, which also survive Git Bash on Windows. */
export function snippet(scriptPath: string): string {
  const command = `node ${JSON.stringify(scriptPath.replaceAll("\\", "/"))}`;
  return JSON.stringify({ statusLine: { type: "command", command, refreshInterval: 10 } }, null, 2);
}

/** A warning when the stable copy exists but differs from the installed script (after an update). */
export function staleCopyNote(env: EnvReader, currentScript: string): string | null {
  const stable = stableScriptPath(env);
  if (stable === null) return null;
  const copy = readTextBounded(stable, SCRIPT_LIMIT);
  if (copy.kind !== "ok") return null;
  const current = readTextBounded(currentScript, SCRIPT_LIMIT);
  if (current.kind !== "ok" || current.text === copy.text) return null;
  return `The copy at ${stable} is not the installed version. Run \`setup --copy\` to refresh it.`;
}

export interface SetupResult {
  text: string;
  copied: boolean;
}

/**
 * Explains how to turn the status line on. It edits nothing in the user's settings. With `copy`
 * it writes exactly one file: a copy of this script in `<claude config dir>/aws-ui/`, so the path
 * in the snippet survives plugin updates (re-run after updating to refresh the copy).
 */
export function setup(
  env: EnvReader,
  currentScript: string,
  options: { copy: boolean },
): SetupResult {
  const lines: string[] = [];
  const existing = detectStatusLine(env);
  let target = currentScript;
  let copied = false;

  if (options.copy) {
    const stable = stableScriptPath(env);
    if (stable === null) {
      lines.push("Could not find the Claude config directory, so nothing was copied.");
    } else {
      mkdirSync(join(stable, ".."), { recursive: true });
      copyFileSync(currentScript, stable);
      target = stable;
      copied = true;
      lines.push(`Copied the status-line script to ${stable} (re-run after updating aws-ui).`);
    }
  } else {
    lines.push(
      "This path belongs to the installed plugin version and changes when the plugin updates.",
      "Run `setup --copy` to keep a stable copy under your Claude config directory instead.",
    );
    const note = staleCopyNote(env, currentScript);
    if (note !== null) lines.push("", note);
  }

  lines.push("", "To turn the status line on, add this to ~/.claude/settings.json yourself:", "");
  lines.push(snippet(target), "");
  if (existing.isConfigured) {
    lines.push(
      "You already have a statusLine configured, and Claude Code supports only one. This plugin did not change it.",
      `Current command: ${existing.command ?? "(not a command)"}`,
      "To keep it, run aws-ui's script from inside your own script and print both lines.",
    );
  } else {
    lines.push(
      "You have no statusLine configured, so the snippet above will not replace anything.",
    );
  }
  return { text: lines.join("\n"), copied };
}

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CommonHookInput } from "./hook-input.js";
import { findSecretLikeStrings, type SecretFinding } from "./secrets.js";

export interface HookResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** stdout parsed as a single JSON object, as Claude Code does on exit 0; undefined otherwise. */
  json: Record<string, unknown> | undefined;
  /** Secret-like strings found in stdout or stderr. Tests should assert this is empty. */
  secretFindings: SecretFinding[];
  timedOut: boolean;
}

export interface RunOptions {
  pluginRoot: string;
  /** Defaults to a fresh temporary directory, like a first-run plugin data directory. */
  pluginDataDir?: string;
  projectDir?: string;
  /**
   * Extra environment variables. The parent environment is not inherited except PATH-like basics.
   * In particular the real home directory is not: HOME and USERPROFILE point to a fresh temporary
   * directory and instance metadata is disabled, so a hook under test cannot pick up the
   * developer's AWS profiles, SSO cache, or credentials.
   */
  env?: Record<string, string>;
  timeoutMs?: number;
}

interface HookCommand {
  type: string;
  command: string;
  args?: string[];
  timeout?: number;
}

interface HookMatcherGroup {
  matcher?: string;
  hooks: HookCommand[];
}

interface HooksFile {
  hooks: Record<string, HookMatcherGroup[]>;
}

const INHERITED_ENV = [
  "PATH",
  "Path",
  "PATHEXT",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
];

function baseEnv(
  options: RunOptions,
  pluginDataDir: string,
  projectDir: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of INHERITED_ENV) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  const isolatedHome = mkdtempSync(join(tmpdir(), "hook-home-"));
  return {
    ...env,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    AWS_EC2_METADATA_DISABLED: "true",
    CLAUDE_PLUGIN_ROOT: options.pluginRoot,
    CLAUDE_PLUGIN_DATA: pluginDataDir,
    CLAUDE_PROJECT_DIR: projectDir,
    ...options.env,
  };
}

function substitute(value: string, vars: Record<string, string>): string {
  return value.replace(
    /\$\{(CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA|CLAUDE_PROJECT_DIR)\}/g,
    (_, name: string) => vars[name] ?? "",
  );
}

function parseSingleJsonObject(stdout: string): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Spawns an executable with the hook payload on stdin and collects the result. */
export function runProcess(
  command: string,
  args: readonly string[],
  input: unknown,
  env: NodeJS.ProcessEnv,
  cwd: string,
  timeoutMs: number,
): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        json: exitCode === 0 ? parseSingleJsonObject(stdout) : undefined,
        secretFindings: [...findSecretLikeStrings(stdout), ...findSecretLikeStrings(stderr)],
        timedOut,
      });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

/** Runs one bundled hook script with node, outside of any hooks.json wiring. */
export function runHookScript(
  script: string,
  input: CommonHookInput,
  options: RunOptions,
): Promise<HookResult> {
  const pluginDataDir = options.pluginDataDir ?? mkdtempSync(join(tmpdir(), "plugin-data-"));
  const projectDir = options.projectDir ?? input.cwd;
  return runProcess(
    process.execPath,
    [script],
    input,
    baseEnv(options, pluginDataDir, projectDir),
    projectDir,
    options.timeoutMs ?? 30_000,
  );
}

function matches(group: HookMatcherGroup, input: CommonHookInput): boolean {
  if (group.matcher === undefined || group.matcher === "" || group.matcher === "*") return true;
  const target =
    typeof input["tool_name"] === "string"
      ? input["tool_name"]
      : (input["source"] as string | undefined);
  if (target === undefined) return true;
  return new RegExp(`^(?:${group.matcher})$`).test(target);
}

/**
 * Runs every hook that the plugin's hooks/hooks.json registers for the input's event, the way
 * Claude Code would in exec form. Throws on shell-form hooks: this repository requires exec form
 * so hooks behave the same on macOS, Linux, and Windows.
 */
export async function runPluginHooks(
  input: CommonHookInput,
  options: RunOptions,
): Promise<HookResult[]> {
  const file = JSON.parse(
    readFileSync(join(options.pluginRoot, "hooks", "hooks.json"), "utf8"),
  ) as HooksFile;
  const groups = file.hooks[input.hook_event_name] ?? [];
  const pluginDataDir = options.pluginDataDir ?? mkdtempSync(join(tmpdir(), "plugin-data-"));
  const projectDir = options.projectDir ?? input.cwd;
  const vars = {
    CLAUDE_PLUGIN_ROOT: options.pluginRoot,
    CLAUDE_PLUGIN_DATA: pluginDataDir,
    CLAUDE_PROJECT_DIR: projectDir,
  };
  const results: HookResult[] = [];
  for (const group of groups.filter((g) => matches(g, input))) {
    for (const hook of group.hooks) {
      if (hook.type !== "command") continue;
      if (hook.args === undefined) {
        throw new Error(`Hook "${hook.command}" uses shell form; use exec form with "args".`);
      }
      const command = hook.command === "node" ? process.execPath : substitute(hook.command, vars);
      results.push(
        await runProcess(
          command,
          hook.args.map((arg) => substitute(arg, vars)),
          input,
          baseEnv(options, pluginDataDir, projectDir),
          projectDir,
          options.timeoutMs ?? (hook.timeout ?? 30) * 1000,
        ),
      );
    }
  }
  return results;
}

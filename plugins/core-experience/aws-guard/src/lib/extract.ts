// Finds AWS-affecting invocations in a Bash command. It looks through the usual wrappers (`sudo`,
// `env`, `xargs`, `npx`, `aws-vault exec`), through `bash -c`, `eval`, here-documents, and command
// substitutions. What it cannot look through (a computed command name, a script fed through a
// pipe, an `eval` of an expansion) is reported as unanalyzable instead of being guessed at.
import { type SimpleCommand, parseShell, type Word } from "./shell.js";
import { AWS_TOOLS } from "./rules/tools.js";
import type { Invocation } from "./types.js";

export interface Extraction {
  invocations: Invocation[];
  /** Something that might run an AWS tool could not be analyzed. */
  unanalyzable: boolean;
  truncated: boolean;
}

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "fish"]);
const PASSTHROUGH = new Set([
  "sudo",
  "doas",
  "nohup",
  "command",
  "exec",
  "nice",
  "ionice",
  "stdbuf",
  "builtin",
  "time",
  "watch",
  "setsid",
]);
/** Commands that run another command named in a string argument, possibly on another machine. */
const CARRIERS = new Set(["ssh", "docker", "podman", "kubectl", "su", "runuser", "sg", "script"]);
const RUNNERS = new Set(["npx", "bunx", "uvx", "pipx", "pnpx"]);
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const MAX_UNWRAP = 8;
const MAX_DEPTH = 5;

const MENTION =
  /(^|[^\w./-])(aws|cdk|sam|terraform|tofu|terragrunt|eksctl|serverless|sls|pulumi|copilot|aws-vault)(?![\w-])/i;

/** True when the text names one of the tools this guard watches. */
export function mentionsAwsTool(text: string): boolean {
  return MENTION.test(text);
}

function baseName(word: string): string {
  const slash = Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\"));
  const name = slash >= 0 ? word.slice(slash + 1) : word;
  return name.replace(/\.(exe|cmd|bat)$/i, "");
}

function textOf(words: readonly Word[]): string[] {
  return words.map((word) => word.text);
}

interface Context {
  invocations: Invocation[];
  unanalyzable: boolean;
  truncated: boolean;
}

function skipFlags(words: Word[], withValue: ReadonlySet<string>): Word[] {
  let index = 0;
  while (index < words.length) {
    const text = words[index]?.text ?? "";
    if (text === "--") {
      index += 1;
      break;
    }
    if (!text.startsWith("-") || text === "-") break;
    index += withValue.has(text) ? 2 : 1;
  }
  return words.slice(index);
}

function analyze(
  command: SimpleCommand,
  baseEnv: Record<string, string>,
  depth: number,
  context: Context,
): void {
  let words = command.words;
  const env: Record<string, string> = { ...baseEnv, ...command.env };
  let vaultProfile: string | null = null;
  let dynamicTail = false;

  for (let step = 0; step < MAX_UNWRAP && words.length > 0; step += 1) {
    const head = words[0];
    if (head === undefined) return;
    if (head.dynamic) {
      context.unanalyzable = true;
      return;
    }
    const name = baseName(head.text).toLowerCase();
    const rest = words.slice(1);

    if (PASSTHROUGH.has(name)) {
      words = skipFlags(rest, new Set(["-u", "-g", "-n", "-p", "-t", "-c", "-i", "-o", "-e"]));
      continue;
    }
    if (name === "timeout") {
      const flagless = skipFlags(rest, new Set(["-s", "-k", "--signal", "--kill-after"]));
      words = flagless.slice(1);
      continue;
    }
    if (name === "env") {
      let index = 0;
      while (index < rest.length) {
        const text = rest[index]?.text ?? "";
        if (text === "-u" || text === "--unset") index += 2;
        else if (text.startsWith("-")) index += 1;
        else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(text)) {
          env[text.slice(0, text.indexOf("="))] = text.slice(text.indexOf("=") + 1);
          index += 1;
        } else break;
      }
      words = rest.slice(index);
      continue;
    }
    if (name === "xargs") {
      dynamicTail = true;
      words = skipFlags(
        rest,
        new Set(["-I", "-n", "-P", "-d", "-L", "-s", "-E", "-a", "-l", "-i"]),
      );
      continue;
    }
    if (name === "aws-vault") {
      const afterExec = rest[0]?.text === "exec" ? rest.slice(1) : rest;
      let index = 0;
      while (index < afterExec.length && (afterExec[index]?.text ?? "").startsWith("-")) index += 1;
      vaultProfile = afterExec[index]?.text ?? null;
      const dash = afterExec.findIndex((word) => word.text === "--");
      words = dash >= 0 ? afterExec.slice(dash + 1) : afterExec.slice(index + 1);
      continue;
    }
    if (RUNNERS.has(name)) {
      words = skipFlags(rest, new Set(["-p", "--package", "-c"]));
      if (words[0]?.text === "aws-cdk")
        words = [{ text: "cdk", dynamic: false }, ...words.slice(1)];
      continue;
    }
    if (PACKAGE_MANAGERS.has(name)) {
      const sub = rest[0]?.text;
      if (sub === "exec" || sub === "dlx" || sub === "x") {
        words = skipFlags(rest.slice(1), new Set(["-p", "--package", "-c"]));
        continue;
      }
      if (sub !== undefined && AWS_TOOLS.has(sub)) {
        words = rest;
        continue;
      }
      return;
    }
    if (SHELLS.has(name)) {
      shellCommand(name, rest, command, env, depth, context);
      return;
    }
    if (name === "eval") {
      const script = textOf(rest).join(" ");
      if (rest.some((word) => word.dynamic)) context.unanalyzable = true;
      recurse(script, env, depth, context);
      return;
    }
    if (name === "source" || name === ".") return;
    if (CARRIERS.has(name)) {
      for (const word of rest) {
        if (/\s/.test(word.text) && mentionsAwsTool(word.text))
          recurse(word.text, env, depth, context);
      }
      return;
    }
    if (AWS_TOOLS.has(name)) {
      const args = textOf(rest);
      context.invocations.push({
        tool: name === "sls" ? "serverless" : name,
        args,
        dynamic: dynamicTail || rest.some((word) => word.dynamic),
        env,
        vaultProfile,
      });
      return;
    }
    return;
  }
}

function shellCommand(
  name: string,
  rest: Word[],
  command: SimpleCommand,
  env: Record<string, string>,
  depth: number,
  context: Context,
): void {
  // `bash -c "script"`, also `-lc` and `-ec`.
  const flagIndex = rest.findIndex((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text));
  if (flagIndex >= 0) {
    const script = rest.slice(flagIndex + 1).find((word) => !word.text.startsWith("-"));
    if (script === undefined) return;
    if (script.dynamic) context.unanalyzable = true;
    recurse(script.text, env, depth, context);
    return;
  }
  if (command.stdinText !== null) {
    recurse(command.stdinText, env, depth, context);
    return;
  }
  if (command.piped && name !== "") {
    // A script arriving through a pipe cannot be seen from here.
    context.unanalyzable = true;
  }
}

function recurse(
  source: string,
  env: Record<string, string>,
  depth: number,
  context: Context,
): void {
  if (depth >= MAX_DEPTH) {
    context.truncated = true;
    context.unanalyzable = true;
    return;
  }
  const parsed = parseShell(source);
  if (parsed.truncated) context.truncated = true;
  for (const sub of parsed.commands) analyze(sub, env, depth + 1, context);
}

/** Finds the AWS-affecting invocations in a shell command line. */
export function extractInvocations(source: string): Extraction {
  const context: Context = { invocations: [], unanalyzable: false, truncated: false };
  recurse(source, {}, 0, context);
  return context;
}

import { readTextBounded } from "@claude-code-aws/context-contract/node";
import {
  buildReport,
  type AnalysisReport,
  type Finding,
  LOCAL_CONTEXT,
  makeFinding,
  renderReport,
  type Severity,
} from "@claude-code-aws/report-contract";
import { redactText } from "@claude-code-aws/safe-output";
import { loadStacks, type LoadedStack } from "@claude-code-aws/template-analysis/node";
import { isInside } from "@claude-code-aws/tool-runner";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export interface CliResult {
  exitCode: number;
  stdout: string;
}
export interface CliDeps {
  root: string;
  now?: Date;
}

export interface Args {
  words: string[];
  options: Map<string, string[]>;
  flags: Set<string>;
  one: (name: string) => string | undefined;
  num: (name: string, fallback: number) => number;
}

export interface Ctx {
  root: string;
  now: Date;
  args: Args;
  /** Positional words after the command name. */
  words: string[];
  json: boolean;
  /** Text, or JSON when --json was given. */
  out: (value: unknown, text: string) => CliResult;
  fail: (message: string, exitCode?: number) => CliResult;
  /** Reads a JSON file inside the project (bounded). */
  readJson: (
    path: string,
    maxBytes?: number,
  ) => { ok: true; value: unknown } | { ok: false; error: string };
  /** Reads a text file inside the project (bounded). */
  readText: (
    path: string,
    maxBytes?: number,
  ) => { ok: true; text: string } | { ok: false; error: string };
  /** Creates a new file inside the project; never overwrites. Returns a one-line message. */
  save: (path: string, content: string) => string;
  /** Synthesized templates from cdk.out (default) or a file. */
  stacks: (path?: string) => { stacks: LoadedStack[]; problems: string[] };
}

export interface Command {
  help: string;
  run: (ctx: Ctx) => CliResult | Promise<CliResult>;
}

export interface CliConfig {
  name: string;
  /** One line saying what it will not do. */
  promise: string;
  commands: Record<string, Command>;
  valued?: string[];
  flags?: string[];
}

export const usageText = (config: CliConfig): string => {
  const width = Math.max(...Object.keys(config.commands).map((c) => c.length)) + 2;
  return `Usage: ${config.name} <command> [options]\n\n${Object.entries(config.commands)
    .map(([name, c]) => `  ${name.padEnd(width)}${c.help}`)
    .join(
      "\n",
    )}\n\nOptions: --json${(config.flags ?? []).length > 0 ? `  ${(config.flags ?? []).map((f) => `--${f}`).join("  ")}` : ""}\n\n${config.promise}`;
};

function parse(
  argv: readonly string[],
  valued: readonly string[],
  flags: readonly string[],
): Args | string {
  const words: string[] = [];
  const options = new Map<string, string[]>();
  const set = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "json" || flags.includes(name)) set.add(name);
    else if (valued.includes(name)) {
      const value = argv[i + 1];
      if (value === undefined) return `--${name} needs a value`;
      options.set(name, [...(options.get(name) ?? []), value]);
      i += 1;
    } else return `unknown option --${name}`;
  }
  return {
    words,
    options,
    flags: set,
    one: (n) => options.get(n)?.[0],
    num: (n, fallback) => {
      const v = options.get(n)?.[0];
      return v === undefined ? fallback : Number(v);
    },
  };
}

export function defineCli(
  config: CliConfig,
): (argv: readonly string[], deps: CliDeps) => Promise<CliResult> {
  const usage = usageText(config);
  return async (argv, deps) => {
    const args = parse(argv, config.valued ?? [], config.flags ?? []);
    if (typeof args === "string") return { exitCode: 2, stdout: `${args}\n\n${usage}` };
    const [command, ...rest] = args.words;
    if (command === undefined) return { exitCode: 2, stdout: `a command is required\n\n${usage}` };
    const handler = Object.hasOwn(config.commands, command) ? config.commands[command] : undefined;
    if (handler === undefined)
      return { exitCode: 2, stdout: `unknown command ${command}\n\n${usage}` };
    const json = args.flags.has("json");
    const resolvePath = (path: string): string =>
      isAbsolute(path) ? path : resolve(deps.root, path);
    const ctx: Ctx = {
      root: deps.root,
      now: deps.now ?? new Date(),
      args,
      words: rest,
      json,
      out: (value, text) => ({ exitCode: 0, stdout: json ? JSON.stringify(value, null, 2) : text }),
      fail: (message, exitCode = 1) => ({
        exitCode,
        stdout: exitCode === 2 ? `${message}\n\n${usage}` : message,
      }),
      readText: (path, maxBytes = 2_000_000) => {
        const target = resolvePath(path);
        if (!isInside(deps.root, target))
          return { ok: false, error: `${path} is outside the project` };
        const read = readTextBounded(target, maxBytes);
        return read.kind === "ok"
          ? { ok: true, text: read.text }
          : { ok: false, error: `${path} could not be read (${read.kind})` };
      },
      readJson: (path, maxBytes) => {
        const text = ctx.readText(path, maxBytes);
        if (!text.ok) return text;
        try {
          return { ok: true, value: JSON.parse(text.text) as unknown };
        } catch {
          return { ok: false, error: `${path} is not valid JSON` };
        }
      },
      save: (path, content) => {
        const target = resolvePath(path);
        if (!isInside(deps.root, target))
          return "Not written: the output path is outside the project";
        try {
          mkdirSync(dirname(target), { recursive: true });
          if (!isInside(deps.root, target))
            return "Not written: the output path is outside the project";
          const fd = openSync(target, "wx");
          try {
            writeSync(fd, Buffer.from(content, "utf8"));
          } finally {
            closeSync(fd);
          }
          return `Created ${target.slice(resolve(deps.root).length + 1).replaceAll("\\", "/")}`;
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === "EEXIST"
            ? `Not written: ${path} already exists; it was not overwritten`
            : "Not written: the file could not be written";
        }
      },
      stacks: (path) => {
        const loaded = loadStacks(deps.root, path ?? "cdk.out");
        return { stacks: loaded.stacks, problems: loaded.problems };
      },
    };
    try {
      return await handler.run(ctx);
    } catch {
      return { exitCode: 1, stdout: `${config.name} ${command} failed unexpectedly.` };
    }
  };
}

/** The body of every plugin's `src/entries/cli.ts`. */
export async function runEntry(
  name: string,
  run: (argv: readonly string[], deps: CliDeps) => Promise<CliResult>,
): Promise<void> {
  try {
    const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
    const result = await run(process.argv.slice(2), { root });
    process.stdout.write(`${result.stdout}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(
      `${name} failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
    );
    process.exitCode = 1;
  }
}

export interface FindingSpec {
  ruleId: string;
  severity: Severity;
  title: string;
  explanation: string;
  subject: string;
  resources?: string[];
  recommendation?: string;
  evidenceRef?: string;
  status?: Finding["status"];
}

/** A finding about declared infrastructure: static, with the template location as evidence. */
export function staticFinding(plugin: string, f: FindingSpec): Finding {
  return makeFinding({
    ruleId: f.ruleId,
    plugin,
    severity: f.severity,
    status: f.status ?? "confirmed",
    source: "static",
    title: f.title,
    explanation: f.explanation,
    subject: f.subject,
    ...(f.resources === undefined ? {} : { affectedResources: f.resources }),
    ...(f.recommendation === undefined ? {} : { recommendation: f.recommendation }),
    evidence: [{ type: "template", reference: f.evidenceRef ?? f.subject }],
  });
}

export function localReport(
  plugin: string,
  summary: string,
  findings: Finding[],
  limitations: string[],
  now: Date,
): AnalysisReport {
  return buildReport({
    plugin,
    context: LOCAL_CONTEXT,
    mode: "local",
    summary,
    findings,
    limitations,
    now,
  });
}

export const TEMPLATE_LIMITATION =
  "Templates show what is defined in code, not what is deployed or how it behaves at run time.";

/** A report as text or JSON, with load problems as notes. */
export function reportResult(ctx: Ctx, report: AnalysisReport, notes: string[] = []): CliResult {
  return ctx.out(
    report,
    [renderReport(report), ...notes.map((n) => `Note: ${redactText(n).text}`)].join("\n"),
  );
}

/** Runs `inspect` style commands over every stack, collecting findings. */
export function eachStack<T>(stacks: readonly LoadedStack[], fn: (stack: LoadedStack) => T[]): T[] {
  return stacks.flatMap((s) => fn(s));
}

export const noTemplates = (ctx: Ctx, problems: string[], path: string | undefined): CliResult =>
  ctx.fail(
    problems.join("\n") ||
      `No templates were found in ${path ?? "cdk.out"}. Run /aws-infrastructure:synth first.`,
  );

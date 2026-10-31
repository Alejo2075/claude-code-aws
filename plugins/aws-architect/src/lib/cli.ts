import { isAbsolute, resolve } from "node:path";

import { readTextBounded } from "@claude-code-aws/context-contract/node";
import { loadStacks } from "@claude-code-aws/template-analysis/node";
import { isInside } from "@claude-code-aws/tool-runner";

import { type AdrInput, renderAdr, writeAdr } from "./adr.js";
import { architectureOf, DIAGRAM_DEPRECATION, toMermaid } from "./diagram.js";
import { getTopic, renderTopic, renderTopicList, TOPIC_NAMES } from "./decisions.js";
import { checkIntake, renderIntake } from "./intake.js";
import { checkPlan, initPlan, renderPlan } from "./plan.js";
import { review } from "./review.js";

export const USAGE = `Usage: aws-architect <command> [options]

  diagram [path] [--stack name]        DEPRECATED, use aws-diagrams: Mermaid diagram of cdk.out or a template
  review [path]                        Well-Architected style questions a template can answer, with evidence
  decisions [topic]                    Decision tables with sources (${TOPIC_NAMES.join(", ")})
  intake --requirements '<json>'       Which requirement questions are still open
  plan init --title <t> [--requirements '<json>']   A starting architecture plan (JSON)
  plan check <file>                    Validate a plan file
  adr --title <t> --decision <d> [--context <c>] [--consequences <c>] [--option <o>]... [--status s] [--write]
                                       Draft an ADR; written to docs/adr only with --write

Options: --json

Nothing here calls AWS or changes the project, except adr --write, which creates a new file and never overwrites one.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}
export interface CliDeps {
  root: string;
  now?: Date;
}

const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const FLAGS = ["json", "write"];
const VALUED = [
  "stack",
  "requirements",
  "title",
  "decision",
  "context",
  "consequences",
  "option",
  "status",
  "file",
];
const MAX_JSON = 20_000;

export function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  return Promise.resolve(run(argv, deps));
}

function requirementsOf(text: string): Record<string, string> | null {
  if (text.length > MAX_JSON) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const out: Record<string, string> = {};
    for (const [key, answer] of Object.entries(value)) {
      if (typeof answer !== "string") return null;
      out[key.slice(0, 60)] = answer;
    }
    return out;
  } catch {
    return null;
  }
}

function run(argv: readonly string[], deps: CliDeps): CliResult {
  const words: string[] = [];
  const options = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (FLAGS.includes(name)) flags.add(name);
    else if (VALUED.includes(name)) {
      const value = argv[i + 1];
      if (value === undefined) return usageError(`--${name} needs a value`);
      options.set(name, [...(options.get(name) ?? []), value]);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = flags.has("json");
  const one = (name: string): string | undefined => options.get(name)?.[0];
  const [command, sub, third] = words;
  const now = deps.now ?? new Date();
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text,
  });

  if (command === "diagram" || command === "review") {
    if (sub !== undefined && third !== undefined) return usageError("too many arguments");
    const loaded = loadStacks(deps.root, sub ?? "cdk.out");
    if (loaded.stacks.length === 0)
      return { exitCode: 1, stdout: loaded.problems.join("\n") || "No templates were found." };
    const wanted = one("stack");
    const stacks =
      wanted === undefined ? loaded.stacks : loaded.stacks.filter((s) => s.name === wanted);
    if (stacks.length === 0) return usageError(`no stack named ${wanted ?? ""}`);
    const notes = loaded.problems.map((problem) => `Note: ${problem}`);
    if (command === "diagram") {
      const parts = stacks.map((stack) => ({
        stack: stack.name,
        architecture: architectureOf(stack.template),
      }));
      const text = parts
        .map(
          (part) =>
            `Stack ${part.stack}\n\n\`\`\`mermaid\n${toMermaid(part.architecture)}\n\`\`\`\n\nSolid arrows are written in the template. Dotted arrows are inferred from permissions or environment variables: they show a function can reach a resource, not that it does.`,
        )
        .concat(notes, DIAGRAM_DEPRECATION)
        .join("\n\n");
      return print(
        {
          schemaVersion: "1",
          deprecated: DIAGRAM_DEPRECATION,
          stacks: parts,
          problems: loaded.problems,
        },
        text,
      );
    }
    const reviews = stacks.map((stack) => ({ stack: stack.name, ...review(stack.template) }));
    const text = reviews
      .map((r) =>
        [
          `Stack ${r.stack}`,
          ...r.answered.map(
            (a) =>
              `  [${a.answer.toUpperCase()}] ${a.id} (${a.pillar}) ${a.question}\n      ${a.evidence}\n      ${a.source}`,
          ),
          ...r.needsOthers.map((line) => `  Not covered: ${line}`),
        ].join("\n"),
      )
      .concat(notes)
      .join("\n\n");
    return print({ schemaVersion: "1", reviews, problems: loaded.problems }, text);
  }

  if (command === "decisions") {
    if (third !== undefined) return usageError("too many arguments");
    if (sub === undefined) return print({ topics: TOPIC_NAMES }, renderTopicList());
    const topic = getTopic(sub);
    if (topic === null) return usageError(`unknown topic ${sub}`);
    return print({ topic: sub, ...topic }, renderTopic(sub, topic));
  }

  if (command === "intake") {
    const raw = one("requirements");
    const requirements = raw === undefined ? {} : requirementsOf(raw);
    if (requirements === null) return usageError("--requirements must be a JSON object of strings");
    const result = checkIntake(requirements);
    return print(result, renderIntake(result));
  }

  if (command === "plan") {
    if (sub === "init") {
      const title = one("title");
      if (title === undefined) return usageError("plan init needs --title");
      const raw = one("requirements");
      const requirements = raw === undefined ? {} : requirementsOf(raw);
      if (requirements === null)
        return usageError("--requirements must be a JSON object of strings");
      const plan = initPlan(title, requirements, now);
      return { exitCode: 0, stdout: JSON.stringify(plan, null, 2) };
    }
    if (sub === "check") {
      if (third === undefined) return usageError("plan check needs a file");
      const path = isAbsolute(third) ? third : resolve(deps.root, third);
      if (!isInside(deps.root, path)) return usageError("the plan file must be inside the project");
      const read = readTextBounded(path, 1_000_000);
      if (read.kind !== "ok")
        return { exitCode: 1, stdout: `${third} could not be read (${read.kind}).` };
      const checked = checkPlan(read.text);
      if (!checked.ok) return { exitCode: 1, stdout: `Not a valid plan: ${checked.error}` };
      return print(checked, renderPlan(checked.plan, checked.warnings));
    }
    return usageError("plan needs init or check");
  }

  if (command === "adr") {
    const title = one("title");
    const decision = one("decision");
    if (title === undefined || decision === undefined)
      return usageError("adr needs --title and --decision");
    const status = one("status") ?? "proposed";
    if (status !== "proposed" && status !== "accepted" && status !== "superseded")
      return usageError("--status must be proposed, accepted, or superseded");
    const input: AdrInput = {
      title,
      status,
      decision,
      context: one("context") ?? "",
      consequences: one("consequences") ?? "",
      options: options.get("option") ?? [],
    };
    const date = now.toISOString().slice(0, 10);
    if (!flags.has("write")) {
      const text = renderAdr(input, 0, date);
      return print(
        { written: false },
        `${text}\n(Draft only; add --write to create the file under docs/adr.)`,
      );
    }
    const written = writeAdr(deps.root, input, date);
    return written.ok
      ? print({ written: true, file: written.file }, `Created ${written.file}`)
      : { exitCode: 1, stdout: `Not written: ${written.error}.` };
  }

  return usageError(command === undefined ? "a command is required" : `unknown command ${command}`);
}

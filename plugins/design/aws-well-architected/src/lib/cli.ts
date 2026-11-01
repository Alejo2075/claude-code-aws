import { isAbsolute, resolve } from "node:path";

import { readTextBounded } from "@claude-code-aws/context-contract/node";
import { QUESTIONS } from "@claude-code-aws/lens-questions";
import { reportCodec, type AnalysisReport } from "@claude-code-aws/report-contract";
import { redactText } from "@claude-code-aws/safe-output";
import { loadStacks } from "@claude-code-aws/template-analysis/node";
import { isInside } from "@claude-code-aws/tool-runner";

import { runReview, type SelfAnswer } from "./engine.js";
import { writeNew } from "./files.js";
import { CRITICALITIES, type Criticality, parseReview, type Scope } from "./model.js";
import { compareReviews, renderComparison, renderImprovementPlan, renderReview } from "./report.js";

export const USAGE = `Usage: aws-well-architected <command> [options]

  scope --name <n> [--criticality low|medium|high|mission-critical] [--environment e] [--version v]
        [--data <classification>] [--window <days>] [--owner o] [--stakeholders a,b] [--constraints a,b]
                                       Print a workload scope (JSON) to save and edit
  evidence-template [path]             Print an answers file to fill in: every question a template cannot answer
  review [path] [--scope f] [--answers f] [--report f]... [--write]
                                       Review cdk.out (default) with your answers and specialist reports
  improve <review.json> [--write]      Prioritized improvement plan (Markdown)
  compare <before.json> <after.json>   What was resolved, regressed, or is still open

Options: --json   --out <name> (with --write; default under docs/reviews)

Reads files inside the project. Writes only new files. No AWS calls. This is not an official AWS review and gives no score.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}
export interface CliDeps {
  root: string;
  now?: Date;
}

const FLAGS = ["json", "write"];
const VALUED = [
  "name",
  "criticality",
  "environment",
  "version",
  "data",
  "window",
  "owner",
  "stakeholders",
  "constraints",
  "scope",
  "answers",
  "report",
  "out",
];
const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: string | undefined): string[] =>
  v === undefined
    ? []
    : v
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "")
        .slice(0, 20);
const text = (v: string | undefined, fallback: string, max = 200): string =>
  redactText(v ?? fallback).text.slice(0, max);

export function makeScope(o: Map<string, string[]>): Scope | string {
  const get = (k: string): string | undefined => o.get(k)?.[0];
  const criticality = get("criticality") ?? "medium";
  if (!(CRITICALITIES as readonly string[]).includes(criticality))
    return `--criticality must be one of ${CRITICALITIES.join(", ")}`;
  const window = get("window") === undefined ? 90 : Number(get("window"));
  if (!Number.isInteger(window) || window < 1 || window > 3650)
    return "--window must be a number of days between 1 and 3650";
  const name = get("name");
  if (name === undefined || name.trim() === "") return "scope needs --name";
  return {
    name: text(name, "", 100),
    criticality: criticality as Criticality,
    environment: text(get("environment"), "unknown", 60),
    architectureVersion: text(get("version"), "unversioned", 60),
    dataClassification: text(get("data"), "not stated", 100),
    evidenceWindowDays: window,
    owner: text(get("owner"), "", 80),
    stakeholders: list(get("stakeholders")).map((s) => text(s, "", 60)),
    dependencies: [],
    constraints: list(get("constraints")).map((s) => text(s, "", 100)),
    knownUnknowns: [],
  };
}

function readJson(
  root: string,
  path: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const target = isAbsolute(path) ? path : resolve(root, path);
  if (!isInside(root, target)) return { ok: false, error: `${path} is outside the project` };
  const read = readTextBounded(target, 4_000_000);
  if (read.kind !== "ok") return { ok: false, error: `${path} could not be read (${read.kind})` };
  try {
    return { ok: true, value: JSON.parse(read.text) as unknown };
  } catch {
    return { ok: false, error: `${path} is not valid JSON` };
  }
}

const ANSWERS = ["yes", "partly", "no", "not-applicable"];
function parseAnswers(
  value: unknown,
): { ok: true; answers: SelfAnswer[]; unknown: string[] } | { ok: false; error: string } {
  const list = isRecord(value) ? value["answers"] : null;
  if (!Array.isArray(list) || list.length > 500)
    return { ok: false, error: 'the answers file must be {"answers": [...]}' };
  const known = new Set(QUESTIONS.map((q) => q.id));
  const answers: SelfAnswer[] = [];
  const unknown: string[] = [];
  for (const a of list) {
    if (
      !isRecord(a) ||
      typeof a["questionId"] !== "string" ||
      typeof a["answer"] !== "string" ||
      !ANSWERS.includes(a["answer"])
    )
      return {
        ok: false,
        error: `each answer needs questionId and answer (${ANSWERS.join(", ")})`,
      };
    if (!known.has(a["questionId"])) {
      unknown.push(a["questionId"].slice(0, 60));
      continue;
    }
    answers.push({
      questionId: a["questionId"],
      answer: a["answer"] as SelfAnswer["answer"],
      ...(typeof a["note"] === "string" ? { note: a["note"].slice(0, 400) } : {}),
      ...(typeof a["answeredBy"] === "string" ? { answeredBy: a["answeredBy"].slice(0, 80) } : {}),
      ...(typeof a["answeredAt"] === "string" ? { answeredAt: a["answeredAt"].slice(0, 30) } : {}),
    });
  }
  return { ok: true, answers, unknown };
}

export function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  return Promise.resolve(run(argv, deps));
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
  const one = (n: string): string | undefined => options.get(n)?.[0];
  const [command, a, b, extra] = words;
  if (extra !== undefined) return usageError("too many arguments");
  const now = deps.now ?? new Date();
  const print = (value: unknown, body: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : body,
  });
  const save = (rel: string, content: string): string => {
    const r = writeNew(deps.root, rel, content);
    return r.ok ? `Created ${r.file}` : `Not written: ${r.error}`;
  };

  if (command === "scope") {
    const scope = makeScope(options);
    return typeof scope === "string"
      ? usageError(scope)
      : { exitCode: 0, stdout: JSON.stringify(scope, null, 2) };
  }

  if (command === "evidence-template") {
    const needing = QUESTIONS.filter((q) => q.evaluate === undefined);
    const template = {
      answers: needing.map((q) => ({
        questionId: q.id,
        answer: "",
        note: "",
        answeredBy: "",
        answeredAt: "",
        _question: q.text,
      })),
      _help:
        'answer is one of "yes", "partly", "no", "not-applicable". Leave a question out if you do not know: it will be listed as missing evidence, never as met.',
    };
    return { exitCode: 0, stdout: JSON.stringify(template, null, 2) };
  }

  if (command === "review") {
    let scope: Scope;
    const scopeFile = one("scope");
    if (scopeFile === undefined)
      scope = makeScope(new Map([["name", ["Unnamed workload"]]])) as Scope;
    else {
      const f = readJson(deps.root, scopeFile);
      if (!f.ok) return { exitCode: 1, stdout: f.error };
      const m = new Map<string, string[]>();
      const v = f.value;
      if (!isRecord(v)) return { exitCode: 1, stdout: `${scopeFile} is not a scope` };
      for (const [k, key] of [
        ["name", "name"],
        ["criticality", "criticality"],
        ["environment", "environment"],
        ["version", "architectureVersion"],
        ["data", "dataClassification"],
        ["owner", "owner"],
      ] as const) {
        const x = v[key];
        if (typeof x === "string") m.set(k, [x]);
      }
      if (typeof v["evidenceWindowDays"] === "number")
        m.set("window", [String(v["evidenceWindowDays"])]);
      if (Array.isArray(v["stakeholders"]))
        m.set("stakeholders", [
          v["stakeholders"].filter((s): s is string => typeof s === "string").join(","),
        ]);
      if (Array.isArray(v["constraints"]))
        m.set("constraints", [
          v["constraints"].filter((s): s is string => typeof s === "string").join(","),
        ]);
      const made = makeScope(m);
      if (typeof made === "string") return { exitCode: 1, stdout: `${scopeFile}: ${made}` };
      scope = made;
    }
    let answers: SelfAnswer[] = [];
    const notes: string[] = [];
    const answersFile = one("answers");
    if (answersFile !== undefined) {
      const f = readJson(deps.root, answersFile);
      if (!f.ok) return { exitCode: 1, stdout: f.error };
      const parsed = parseAnswers(f.value);
      if (!parsed.ok) return { exitCode: 1, stdout: `${answersFile}: ${parsed.error}` };
      answers = parsed.answers.filter((x) => x.answer !== ("" as string));
      if (parsed.unknown.length > 0)
        notes.push(`Answers for unknown questions were ignored: ${parsed.unknown.join(", ")}`);
    }
    const reports: AnalysisReport[] = [];
    for (const file of options.get("report") ?? []) {
      const f = readJson(deps.root, file);
      if (!f.ok) return { exitCode: 1, stdout: f.error };
      const parsed = reportCodec.validate(f.value);
      if (!parsed.ok)
        return { exitCode: 1, stdout: `${file} is not an analysis report (${parsed.error})` };
      reports.push(parsed.value);
    }
    const path = a ?? "cdk.out";
    const loaded = loadStacks(deps.root, path);
    if (loaded.stacks.length === 0)
      notes.push(
        `No templates were read (${loaded.problems.join(" ") || path}); template checks are missing evidence, not passes.`,
      );
    else notes.push(...loaded.problems);
    const review = runReview({ scope, stacks: loaded.stacks, answers, reports, now });
    let body = [renderReview(review), ...notes.map((n) => `Note: ${n}`)].join("\n");
    if (flags.has("write")) {
      const base = (one("out") ?? "docs/reviews/well-architected-review").replace(
        /\.(md|json)$/,
        "",
      );
      body += `\n${save(`${base}.json`, `${JSON.stringify(review, null, 2)}\n`)}\n${save(`${base}.md`, `${renderReview(review)}\n`)}`;
    }
    return print(review, body);
  }

  if (command === "improve") {
    if (a === undefined) return usageError("improve needs a review.json");
    const f = readJson(deps.root, a);
    if (!f.ok) return { exitCode: 1, stdout: f.error };
    const parsed = parseReview(f.value);
    if (!parsed.ok) return { exitCode: 1, stdout: `${a}: ${parsed.error}` };
    const md = renderImprovementPlan(parsed.review);
    return flags.has("write")
      ? {
          exitCode: 0,
          stdout: `${md}\n\n${save(`${(one("out") ?? "docs/reviews/improvement-plan").replace(/\.md$/, "")}.md`, `${md}\n`)}`,
        }
      : print({ markdown: md }, md);
  }

  if (command === "compare") {
    if (a === undefined || b === undefined) return usageError("compare needs two review files");
    const x = readJson(deps.root, a);
    const y = readJson(deps.root, b);
    if (!x.ok) return { exitCode: 1, stdout: x.error };
    if (!y.ok) return { exitCode: 1, stdout: y.error };
    const before = parseReview(x.value);
    const after = parseReview(y.value);
    if (!before.ok) return { exitCode: 1, stdout: `${a}: ${before.error}` };
    if (!after.ok) return { exitCode: 1, stdout: `${b}: ${after.error}` };
    const c = compareReviews(before.review, after.review);
    return print(c, renderComparison(c, before.review, after.review));
  }

  return usageError(command === undefined ? "a command is required" : `unknown command ${command}`);
}

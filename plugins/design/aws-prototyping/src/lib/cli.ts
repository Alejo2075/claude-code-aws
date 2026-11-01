import { readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { readTextBounded } from "@claude-code-aws/context-contract/node";
import { redactText } from "@claude-code-aws/safe-output";
import { isInside } from "@claude-code-aws/tool-runner";

import { PATTERNS, patternById } from "./catalog.js";
import { writeNew } from "./files.js";
import {
  checkManifest,
  type Manifest,
  OPERATORS,
  parseManifest,
  SLUG,
  toYaml,
} from "./manifest.js";
import { cleanupPlan, promotionPlan, sandboxPlan } from "./plans.js";
import {
  groupResults,
  parseResult,
  type ResultRecord,
  renderComparison,
  SOURCES,
  type Source,
} from "./results.js";
import { scanDirectory } from "./scan.js";
import { simulateQueue, SIM_METRICS, validateModel, type QueueModel } from "./sim.js";

export const USAGE = `Usage: aws-prototyping <command> [options]

  patterns                                   The starting patterns
  start --name <slug> --pattern <id> --hypothesis <text> --metric <name> --target <n> [--op <=] [--unit ms]
        [--question <q>] [--owner o] [--budget-usd 0] [--budget-hours 4] [--requests n] [--runs n]
        [--deadline YYYY-MM-DD] [--blast <text>] [--write]
                                             Draft prototypes/<slug>/ (manifest, README, fixtures); files only with --write
  validate <dir>                             Is it bounded enough to run, and is anything unsafe inside?
  experiment <dir> --variant <id> [--rate 50 --duration 60 --service-ms 120 --jitter 0.3 --workers 5 --batch 1 --overhead 0 --seed 1 --repeat 5] [--write]
                                             Run the local queue model (a simulation); results labeled simulation
  record <dir> --variant <id> --metric name=value... --source measured|fixture [--note t] [--write]
                                             Keep numbers you measured yourself, labeled by source
  compare <dir> [--write]                    Same metrics side by side, sources kept apart, no significance claims
  sandbox-plan <dir>                         A plan to deploy in the sandbox (nothing is deployed)
  cleanup-plan <dir> [--write]               How to find and remove what the prototype created (nothing is deleted)
  promote <dir> [--write]                    What to fix and which plugins to use to move toward production

Options: --json

Writes only new files under the prototype directory. No AWS calls; it never deploys or deletes.`;

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
  "pattern",
  "hypothesis",
  "metric",
  "target",
  "op",
  "unit",
  "question",
  "owner",
  "budget-usd",
  "budget-hours",
  "requests",
  "runs",
  "deadline",
  "blast",
  "variant",
  "rate",
  "duration",
  "service-ms",
  "jitter",
  "workers",
  "batch",
  "overhead",
  "seed",
  "repeat",
  "source",
  "note",
];
const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const num = (v: string | undefined, fallback: number): number =>
  v === undefined ? fallback : Number(v);
const clean = (v: string, max = 300): string => redactText(v).text.slice(0, max);

export function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  return Promise.resolve(run(argv, deps));
}

function loadManifest(
  root: string,
  dir: string,
  now: Date,
):
  | { ok: true; dir: string; manifest: Manifest; warnings: string[] }
  | { ok: false; error: string; problems?: string[] } {
  const abs = isAbsolute(dir) ? dir : resolve(root, dir);
  if (!isInside(root, abs)) return { ok: false, error: `${dir} is outside the project` };
  const read = readTextBounded(join(abs, "prototype.yaml"), 100_000);
  if (read.kind !== "ok")
    return { ok: false, error: `${dir}/prototype.yaml could not be read (${read.kind})` };
  const parsed = parseManifest(read.text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const checked = checkManifest(parsed.value, now);
  const errors = checked.problems.filter((p) => p.severity === "error").map((p) => p.message);
  if (checked.manifest === null)
    return { ok: false, error: "the manifest is not valid", problems: errors };
  return {
    ok: true,
    dir: abs,
    manifest: checked.manifest,
    warnings: checked.problems.filter((p) => p.severity === "warning").map((p) => p.message),
  };
}

function loadResults(dir: string): ResultRecord[] {
  const out: ResultRecord[] = [];
  let names: string[];
  try {
    names = readdirSync(join(dir, "results"))
      .filter((n) => n.endsWith(".json"))
      .sort()
      .slice(0, 500);
  } catch {
    return out;
  }
  for (const name of names) {
    const read = readTextBounded(join(dir, "results", name), 100_000);
    if (read.kind !== "ok") continue;
    try {
      const rec = parseResult(JSON.parse(read.text) as unknown);
      if (rec !== null) out.push(rec);
    } catch {
      // A file that is not a result is skipped.
    }
  }
  return out;
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
  const [command, dirArg, extra] = words;
  if (extra !== undefined) return usageError("too many arguments");
  const now = deps.now ?? new Date();
  const print = (value: unknown, body: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : body,
  });
  const save = (path: string, content: string): string => {
    const r = writeNew(deps.root, path, content);
    return r.ok ? `Created ${r.file}` : `Not written: ${r.error}`;
  };

  if (command === "patterns")
    return print(
      PATTERNS.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        components: p.components,
        scaffold: p.scaffold,
        defaultQuestion: p.defaultQuestion,
      })),
      PATTERNS.map(
        (p) =>
          `${p.id.padEnd(26)} ${p.title}\n  ${p.summary}\n  Default question: ${p.defaultQuestion}`,
      ).join("\n"),
    );

  if (command === "start") {
    const name = one("name");
    const patternId = one("pattern");
    if (name === undefined || !SLUG.test(name))
      return usageError("start needs --name (lowercase letters, digits, dashes)");
    const pattern = patternId === undefined ? null : patternById(patternId);
    if (pattern === null)
      return usageError(`start needs --pattern, one of: ${PATTERNS.map((p) => p.id).join(", ")}`);
    const hypothesis = one("hypothesis");
    const metric = one("metric");
    const target = one("target");
    if (
      hypothesis === undefined ||
      metric === undefined ||
      target === undefined ||
      !Number.isFinite(Number(target))
    )
      return usageError(
        "start needs --hypothesis, --metric, and a numeric --target: a prototype states what it expects before it runs",
      );
    const op = one("op") ?? "<=";
    if (!(OPERATORS as readonly string[]).includes(op))
      return usageError(`--op must be one of ${OPERATORS.join(" ")}`);
    const deadline =
      one("deadline") ?? new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    const manifest = {
      schemaVersion: 1,
      name,
      owner: clean(one("owner") ?? "", 80),
      status: "draft",
      question: clean(one("question") ?? pattern.defaultQuestion),
      hypothesis: clean(hypothesis),
      successMetric: {
        name: clean(metric, 60),
        operator: op,
        target: Number(target),
        unit: clean(one("unit") ?? "", 20),
      },
      pattern: pattern.id,
      variants: [
        { id: "a", description: "First approach", tradeoffs: "" },
        { id: "b", description: "Alternative to compare against", tradeoffs: "" },
      ],
      budget: { maxUsd: num(one("budget-usd"), 0), maxHours: num(one("budget-hours"), 4) },
      usage: { requestsPerRun: num(one("requests"), 10_000), runs: num(one("runs"), 5) },
      permissions: pattern.permissions,
      assumptions: ["Cost drivers: " + pattern.costDrivers.join("; ")],
      decisionDeadline: deadline,
      blastRadius: clean(
        one("blast") ??
          "Local only. Nothing is deployed; a sandbox is added to this file before any AWS run.",
      ),
      sandbox: null,
      cleanup: {
        tagKey: "prototype",
        tagValue: name,
        resources: pattern.cleanupKinds.map((type) => ({ type, name: "<fill in when created>" })),
      },
      decision: "",
    };
    const checked = checkManifest(manifest, now);
    if (checked.manifest === null)
      return {
        exitCode: 1,
        stdout: `The draft is not valid:\n${checked.problems.map((p) => `  - ${p.message}`).join("\n")}`,
      };
    const base = `prototypes/${name}`;
    const yaml = toYaml(manifest);
    const readme = `# ${name}\n\nQuestion: ${manifest.question}\n\nHypothesis: ${manifest.hypothesis}\n\nPattern: ${pattern.title} (${pattern.components.join(", ")}).\n\nThis is a disposable prototype. Results are in \`results/\`; compare with \`/aws-prototyping:compare\`. Do not copy \`fixtures/\` into production code.\n`;
    if (!flags.has("write"))
      return print(
        {
          manifest,
          files: [
            `${base}/prototype.yaml`,
            `${base}/README.md`,
            ...pattern.fixtures.map((f) => `${base}/${f.file}`),
          ],
        },
        `${yaml}\n(Draft only; add --write to create ${base}/.)`,
      );
    const lines = [
      save(`${base}/prototype.yaml`, yaml),
      save(`${base}/README.md`, readme),
      ...pattern.fixtures.map((f) =>
        save(`${base}/${f.file}`, `${JSON.stringify(f.content, null, 2)}\n`),
      ),
    ];
    if (pattern.scaffold !== null)
      lines.push(
        `Infrastructure for this pattern: /aws-infrastructure:scaffold ${pattern.scaffold} (aws-infrastructure owns the CDK code).`,
      );
    return {
      exitCode: lines.some((l) => l.startsWith("Not written")) ? 1 : 0,
      stdout: lines.join("\n"),
    };
  }

  if (dirArg === undefined || command === undefined)
    return usageError(
      command === undefined ? "a command is required" : `${command} needs a prototype directory`,
    );
  if (
    ![
      "validate",
      "experiment",
      "record",
      "compare",
      "sandbox-plan",
      "cleanup-plan",
      "promote",
    ].includes(command)
  )
    return usageError(`unknown command ${command}`);
  const loaded = loadManifest(deps.root, dirArg, now);
  if (!loaded.ok)
    return {
      exitCode: 1,
      stdout: [loaded.error, ...(loaded.problems ?? []).map((p) => `  - ${p}`)].join("\n"),
    };
  const { manifest, dir } = loaded;
  const rel = dirArg.replace(/\/+$/, "");

  if (command === "validate") {
    const scan = scanDirectory(dir);
    const bad = scan.hits.filter((h) => h.kind === "secret" || h.kind === "wildcard-permission");
    const lines = [
      `Prototype "${manifest.name}": the manifest is complete (question, hypothesis, metric, budget, usage, cleanup, blast radius).`,
      ...loaded.warnings.map((w) => `Warning: ${w}`),
      ...bad.map((h) => `Problem: ${h.file}: ${h.detail}`),
      ...scan.hits.filter((h) => h.kind === "shortcut").map((h) => `Note: ${h.file}: ${h.detail}`),
      `Scanned ${scan.filesRead} file(s)${scan.truncated ? " (stopped at the limit)" : ""}. The scan is a check, not proof that nothing sensitive is present.`,
    ];
    return {
      exitCode: bad.length > 0 ? 1 : 0,
      stdout: json
        ? JSON.stringify({ manifest, warnings: loaded.warnings, hits: scan.hits }, null, 2)
        : lines.join("\n"),
    };
  }

  if (command === "experiment") {
    const variant = one("variant") ?? manifest.variants[0]?.id;
    if (variant === undefined || !manifest.variants.some((v) => v.id === variant))
      return usageError(
        `--variant must be one of: ${manifest.variants.map((v) => v.id).join(", ")}`,
      );
    const model: QueueModel = {
      arrivalRatePerSec: num(one("rate"), 50),
      durationSec: num(one("duration"), 60),
      serviceMsMean: num(one("service-ms"), 120),
      serviceJitter: num(one("jitter"), 0.3),
      workers: num(one("workers"), 5),
      batchSize: num(one("batch"), 1),
      batchOverheadMs: num(one("overhead"), 0),
      seed: num(one("seed"), 1),
    };
    const problem = validateModel(model);
    if (problem !== null) return usageError(problem);
    const repeat = num(one("repeat"), 1);
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 50)
      return usageError("--repeat must be a whole number from 1 to 50");
    const records: ResultRecord[] = [];
    for (let i = 0; i < repeat; i += 1) {
      const seed = model.seed + i;
      const metrics: Record<string, number> = { ...simulateQueue({ ...model, seed }) };
      delete metrics["messages"];
      records.push({
        schemaVersion: 1,
        runId: `${variant}-simulation-${seed}`,
        recordedAt: now.toISOString(),
        variant,
        source: "simulation",
        metrics,
        note: "Simulated from the stated queue model; not measured on AWS.",
        model: { ...model, seed },
      });
    }
    const lines = records.map(
      (r) => `${r.runId}: ${SIM_METRICS.map((k) => `${k}=${r.metrics[k] ?? 0}`).join(" ")}`,
    );
    lines.push(
      "These numbers are SIMULATED from the model you gave (rate, service time, workers, batch). They are not measurements of AWS.",
    );
    if (flags.has("write"))
      for (const r of records)
        lines.push(save(`${rel}/results/${r.runId}.json`, `${JSON.stringify(r, null, 2)}\n`));
    return print(records, lines.join("\n"));
  }

  if (command === "record") {
    const variant = one("variant");
    const source = one("source") as Source | undefined;
    if (variant === undefined || !manifest.variants.some((v) => v.id === variant))
      return usageError(
        `--variant must be one of: ${manifest.variants.map((v) => v.id).join(", ")}`,
      );
    if (source === undefined || !SOURCES.includes(source) || source === "simulation")
      return usageError(
        "--source must be measured or fixture (simulations come from `experiment`)",
      );
    const metrics: Record<string, number> = {};
    for (const pair of options.get("metric") ?? []) {
      const [k, v] = pair.split("=");
      if (
        k === undefined ||
        v === undefined ||
        !/^[a-z0-9_]{1,60}$/.test(k) ||
        !Number.isFinite(Number(v))
      )
        return usageError(
          "--metric must look like name=number (name: lowercase letters, digits, underscore)",
        );
      metrics[k] = Number(v);
    }
    if (Object.keys(metrics).length === 0)
      return usageError("record needs at least one --metric name=value");
    const rec: ResultRecord = {
      schemaVersion: 1,
      runId: `${variant}-${source}-${now.getTime()}`,
      recordedAt: now.toISOString(),
      variant,
      source,
      metrics,
      note: clean(one("note") ?? ""),
    };
    return flags.has("write")
      ? print(rec, save(`${rel}/results/${rec.runId}.json`, `${JSON.stringify(rec, null, 2)}\n`))
      : print(rec, `${JSON.stringify(rec, null, 2)}\n(Preview; add --write to keep it.)`);
  }

  if (command === "compare") {
    const results = loadResults(dir);
    const groups = groupResults(manifest, results);
    const body = renderComparison(manifest, groups);
    const doc = {
      schemaVersion: 1,
      name: manifest.name,
      generatedAt: now.toISOString(),
      successMetric: manifest.successMetric,
      groups,
    };
    const extraLines = flags.has("write")
      ? [`\n${save(`${rel}/experiment-results.json`, `${JSON.stringify(doc, null, 2)}\n`)}`]
      : [];
    return print(doc, [body, ...extraLines].join(""));
  }

  if (command === "sandbox-plan") {
    const plan = sandboxPlan(manifest);
    return typeof plan === "string" ? print({ plan }, plan) : { exitCode: 1, stdout: plan.error };
  }

  if (command === "cleanup-plan") {
    const plan = cleanupPlan(manifest, manifest.sandbox?.region ?? null);
    return flags.has("write")
      ? print({ plan }, `${plan}\n\n${save(`${rel}/cleanup-plan.md`, `${plan}\n`)}`)
      : print({ plan }, plan);
  }

  // promote
  const scan = scanDirectory(dir);
  const plan = promotionPlan(manifest, scan.hits, manifest.decision.trim() !== "");
  return flags.has("write")
    ? print({ plan }, `${plan}\n\n${save(`${rel}/promotion-plan.md`, `${plan}\n`)}`)
    : print({ plan }, plan);
}

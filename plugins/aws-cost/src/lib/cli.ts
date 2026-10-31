import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { renderCostEstimate } from "./render.js";
import { isInside } from "./inside.js";
import { compareApiKind, compareArch, compareLambdaMemory } from "./compare.js";
import { estimateWorkload, sensitivity, validateWorkload } from "./estimate.js";
import { PRICE_NOTE, PRICE_REGION, PRICE_RETRIEVED } from "./prices.js";

export const USAGE = `Usage: aws-cost <command> [options]

  estimate --workload '<json>' | --file <path>   Monthly estimate from stated inputs [--sensitivity]
  compare lambda-memory --requests <n> --points 128:900,256:520,512:300 [--arch x86|arm]
  compare lambda-arch --requests <n> --memory <mb> --x86-ms <ms> --arm-ms <ms>
  compare api-kind --requests <n>
  prices                                         The price snapshot: region, date, and each unit price

Options: --json

Estimates come from your inputs and dated list prices (${PRICE_REGION}, retrieved ${PRICE_RETRIEVED}). They are not billed amounts, and this plugin makes no AWS calls.`;

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
const count = (value: string | true | undefined): number | null => {
  if (typeof value !== "string" || !/^\d{1,13}(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  return Promise.resolve(run(argv, deps));
}

function run(argv: readonly string[], deps: CliDeps): CliResult {
  const words: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (["json", "sensitivity"].includes(name)) options.set(name, true);
    else if (
      ["workload", "file", "requests", "points", "arch", "memory", "x86-ms", "arm-ms"].includes(
        name,
      )
    ) {
      const value = argv[i + 1];
      if (value === undefined) return usageError(`--${name} needs a value`);
      options.set(name, value);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = options.has("json");
  const [command, sub, extra] = words;
  if (extra !== undefined) return usageError("too many arguments");
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text,
  });

  if (command === "estimate") {
    let text: string;
    const inline = options.get("workload");
    const file = options.get("file");
    if (typeof inline === "string") {
      if (inline.length > 20_000) return usageError("--workload is too long; use --file");
      text = inline;
    } else if (typeof file === "string") {
      const path = isAbsolute(file) ? file : resolve(deps.root, file);
      if (!isInside(deps.root, path)) return usageError("--file must be inside the project");
      try {
        text = readFileSync(path, "utf8").slice(0, 200_000);
      } catch {
        return usageError(`${file} could not be read`);
      }
    } else return usageError("give --workload '<json>' or --file <path>");
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return usageError("The workload is not valid JSON.");
    }
    const { input, problems } = validateWorkload(value);
    if (input === null) return usageError(problems.join("\n"));
    if (Object.keys(input).length === 0)
      return usageError("The workload has no sections to estimate.");
    const estimate = estimateWorkload(input, deps.now ?? new Date());
    const table = options.has("sensitivity") ? sensitivity(input) : null;
    return print(
      table === null ? estimate : { estimate, sensitivity: table },
      `${renderCostEstimate(estimate)}${table === null ? "" : `\n\nSensitivity (volumes scaled, same prices):\n${table.map((row) => `  ${String(row.factor).padStart(4)}x  $${row.totalMonthly.toFixed(2)} per month`).join("\n")}\nA cost that grows faster than the volume points at a tier or a fixed charge; one that grows slower, at a free or discounted tier.`}`,
    );
  }

  if (command === "compare") {
    const requests = count(options.get("requests"));
    if (requests === null) return usageError("--requests must be a number");
    if (sub === "api-kind") {
      const c = compareApiKind(requests);
      return print(c, renderComparison(c));
    }
    if (sub === "lambda-memory") {
      const points = String(options.get("points") ?? "")
        .split(",")
        .map((pair) => /^(\d{3,5}):(\d{1,7}(?:\.\d+)?)$/.exec(pair));
      if (points.length === 0 || points.some((m) => m === null))
        return usageError("--points must look like 128:900,256:520 (memory MB : measured ms)");
      const measured = points.map((m) => ({
        memoryMb: Number(m?.[1]),
        durationMs: Number(m?.[2]),
      }));
      if (measured.some((p) => p.memoryMb < 128 || p.memoryMb > 10240))
        return usageError("memory must be from 128 to 10240 MB");
      const arch = options.get("arch") === "arm" ? "arm" : "x86";
      const c = compareLambdaMemory(requests, measured, arch);
      return print(c, renderComparison(c));
    }
    if (sub === "lambda-arch") {
      const memory = count(options.get("memory"));
      const x86 = count(options.get("x86-ms"));
      const arm = count(options.get("arm-ms"));
      if (memory === null || x86 === null || arm === null || memory < 128 || memory > 10240)
        return usageError("lambda-arch needs --memory (128-10240), --x86-ms, and --arm-ms");
      const c = compareArch(requests, memory, x86, arm);
      return print(c, renderComparison(c));
    }
    return usageError("compare supports lambda-memory, lambda-arch, and api-kind");
  }

  if (command === "prices" && sub === undefined) {
    return print(
      { region: PRICE_REGION, retrieved: PRICE_RETRIEVED, note: PRICE_NOTE },
      `${PRICE_NOTE}\nRegion ${PRICE_REGION}, retrieved ${PRICE_RETRIEVED}. See src/data/prices.us-east-1.json for every unit price, its tiers, and its source offer.`,
    );
  }
  return { exitCode: 2, stdout: USAGE };
}

function renderComparison(c: ReturnType<typeof compareApiKind>): string {
  return [
    `Comparison: ${c.kind} (monthly, list prices, ${PRICE_REGION}, snapshot ${PRICE_RETRIEVED})`,
    ...c.options.map(
      (o) =>
        `  ${o.label.padEnd(18)} $${o.monthly.toFixed(2).padStart(10)}   ${o.detail}${o.label === c.cheapest ? "   <-- cheapest" : ""}`,
    ),
    "",
    ...c.notes.map((note) => `- ${note}`),
    "",
    "These are estimates from stated inputs, not billed amounts.",
  ].join("\n");
}

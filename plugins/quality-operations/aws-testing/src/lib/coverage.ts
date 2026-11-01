import { readTextBounded } from "@claude-code-aws/context-contract/node";

export interface CoverageSummary {
  totals: {
    lines: number | null;
    branches: number | null;
    functions: number | null;
    statements: number | null;
  };
  /** Files with the lowest line coverage first. */
  weakest: Array<{ file: string; lines: number }>;
  fileCount: number;
}

interface Metric {
  pct?: number | string;
}
interface Entry {
  lines?: Metric;
  branches?: Metric;
  functions?: Metric;
  statements?: Metric;
}

const pct = (metric: Metric | undefined): number | null => {
  const value = typeof metric?.pct === "number" ? metric.pct : Number(metric?.pct);
  return Number.isFinite(value) ? value : null;
};

/** Reads `coverage-summary.json` (the `json-summary` reporter of Vitest and Jest). */
export function readCoverage(
  coverageDir: string,
  limit = 10,
): { summary: CoverageSummary | null; reason: string | null } {
  const read = readTextBounded(`${coverageDir}/coverage-summary.json`, 8 * 1024 * 1024);
  if (read.kind === "missing") {
    return {
      summary: null,
      reason:
        "No coverage-summary.json was found. Run the tests with --coverage first (the json-summary reporter is added for you).",
    };
  }
  if (read.kind !== "ok") return { summary: null, reason: "The coverage file could not be read." };
  let data: Record<string, Entry>;
  try {
    data = JSON.parse(read.text) as Record<string, Entry>;
  } catch {
    return { summary: null, reason: "The coverage file is not valid JSON." };
  }
  const total = data["total"];
  if (total === undefined) return { summary: null, reason: "The coverage file has no totals." };
  const weakest = Object.entries(data)
    .filter(([name]) => name !== "total")
    .map(([file, entry]) => ({ file, lines: pct(entry.lines) }))
    .filter((entry): entry is { file: string; lines: number } => entry.lines !== null)
    .sort((a, b) => a.lines - b.lines || a.file.localeCompare(b.file))
    .slice(0, limit);
  return {
    summary: {
      totals: {
        lines: pct(total.lines),
        branches: pct(total.branches),
        functions: pct(total.functions),
        statements: pct(total.statements),
      },
      weakest,
      fileCount: Object.keys(data).length - 1,
    },
    reason: null,
  };
}

export function renderCoverage(summary: CoverageSummary): string {
  const fmt = (value: number | null): string => (value === null ? "n/a" : `${value}%`);
  return [
    `Coverage over ${summary.fileCount} file(s): lines ${fmt(summary.totals.lines)}, branches ${fmt(summary.totals.branches)}, functions ${fmt(summary.totals.functions)}, statements ${fmt(summary.totals.statements)}`,
    "",
    "Least covered files (lines):",
    ...summary.weakest.map((entry) => `  ${String(entry.lines).padStart(5)}%  ${entry.file}`),
    "",
    "Coverage measures which lines the tests ran. It does not show that they checked the right things, and tests that use mocks say nothing about the deployed AWS resources.",
  ].join("\n");
}

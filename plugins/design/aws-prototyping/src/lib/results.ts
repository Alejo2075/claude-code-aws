import type { Manifest } from "./manifest.js";

/** Where a number came from. Different sources are never averaged together. */
export type Source = "simulation" | "measured" | "fixture";
export const SOURCES: readonly Source[] = ["simulation", "measured", "fixture"];

export interface ResultRecord {
  schemaVersion: 1;
  runId: string;
  recordedAt: string;
  variant: string;
  source: Source;
  metrics: Record<string, number>;
  note: string;
  /** For a simulation: the model that produced it. */
  model?: Record<string, number>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function parseResult(value: unknown): ResultRecord | null {
  if (!isRecord(value) || value["schemaVersion"] !== 1) return null;
  if (
    typeof value["runId"] !== "string" ||
    typeof value["variant"] !== "string" ||
    !SOURCES.includes(value["source"] as Source)
  )
    return null;
  const metrics = value["metrics"];
  if (!isRecord(metrics)) return null;
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(metrics))
    if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
  return {
    schemaVersion: 1,
    runId: value["runId"],
    recordedAt: typeof value["recordedAt"] === "string" ? value["recordedAt"] : "",
    variant: value["variant"],
    source: value["source"] as Source,
    metrics: clean,
    note: typeof value["note"] === "string" ? value["note"].slice(0, 300) : "",
    ...(isRecord(value["model"])
      ? {
          model: Object.fromEntries(
            Object.entries(value["model"]).filter(
              (e): e is [string, number] => typeof e[1] === "number",
            ),
          ),
        }
      : {}),
  };
}

export const MIN_SAMPLES = 5;

export interface Group {
  variant: string;
  source: Source;
  metric: string;
  n: number;
  mean: number;
  min: number;
  max: number;
  meetsTarget: boolean | null;
}

const meets = (value: number, op: string, target: number): boolean =>
  op === "<"
    ? value < target
    : op === "<="
      ? value <= target
      : op === ">"
        ? value > target
        : op === ">="
          ? value >= target
          : value === target;

export function groupResults(manifest: Manifest, results: readonly ResultRecord[]): Group[] {
  const map = new Map<
    string,
    { variant: string; source: Source; metric: string; values: number[] }
  >();
  for (const r of results)
    for (const [metric, value] of Object.entries(r.metrics)) {
      const key = `${r.variant}\u0000${r.source}\u0000${metric}`;
      const g = map.get(key) ?? { variant: r.variant, source: r.source, metric, values: [] };
      g.values.push(value);
      map.set(key, g);
    }
  return [...map.values()]
    .map((g) => {
      const mean = g.values.reduce((a, b) => a + b, 0) / g.values.length;
      return {
        variant: g.variant,
        source: g.source,
        metric: g.metric,
        n: g.values.length,
        mean: Math.round(mean * 100) / 100,
        min: Math.min(...g.values),
        max: Math.max(...g.values),
        meetsTarget:
          g.metric === manifest.successMetric.name
            ? meets(mean, manifest.successMetric.operator, manifest.successMetric.target)
            : null,
      };
    })
    .sort(
      (a, b) =>
        a.variant.localeCompare(b.variant) ||
        a.source.localeCompare(b.source) ||
        a.metric.localeCompare(b.metric),
    );
}

export function renderComparison(manifest: Manifest, groups: readonly Group[]): string {
  const m = manifest.successMetric;
  const lines = [
    `Comparison for "${manifest.name}"`,
    `Question: ${manifest.question}`,
    `Success: ${m.name} ${m.operator} ${m.target} ${m.unit}`,
    "",
    "Variant  Source      Metric                   n   mean      min       max       vs target",
  ];
  for (const g of groups)
    lines.push(
      `${g.variant.padEnd(8)} ${g.source.padEnd(11)} ${g.metric.padEnd(24)} ${String(g.n).padEnd(3)} ${String(g.mean).padEnd(9)} ${String(g.min).padEnd(9)} ${String(g.max).padEnd(9)} ${g.meetsTarget === null ? "-" : g.meetsTarget ? "meets" : "misses"}`,
    );
  if (groups.length === 0) lines.push("(no results recorded yet)");
  lines.push("");
  const thin = groups.filter((g) => g.metric === m.name && g.n < MIN_SAMPLES);
  if (thin.length > 0)
    lines.push(
      `Too few samples for a claim (fewer than ${MIN_SAMPLES} runs): ${thin.map((g) => `${g.variant}/${g.source} n=${g.n}`).join(", ")}. Treat these as indications, not findings.`,
    );
  const sources = new Set(groups.map((g) => g.source));
  if (sources.has("simulation") && !sources.has("measured"))
    lines.push(
      "All numbers are simulated from the stated model. Nothing here was measured on AWS.",
    );
  if (sources.has("simulation") && sources.has("measured"))
    lines.push("Simulated and measured results are shown separately and never combined.");
  for (const v of manifest.variants)
    if (v.tradeoffs !== "") lines.push(`Trade-offs of ${v.id}: ${v.tradeoffs}`);
  lines.push("No statistical significance is claimed.");
  return lines.join("\n");
}

// Side-by-side costs of alternatives, from the same inputs and prices as the estimate. The numbers
// say which is cheaper at this volume; they say nothing about reliability, latency, or operations,
// which the notes name for every comparison.
import { estimateWorkload } from "./estimate.js";

export interface Option {
  label: string;
  monthly: number;
  detail: string;
}

export interface Comparison {
  kind: string;
  options: Option[];
  cheapest: string;
  notes: string[];
}

const lambdaCost = (
  requests: number,
  durationMs: number,
  memoryMb: number,
  arch: "x86" | "arm",
): number =>
  estimateWorkload({
    lambda: { requestsPerMonth: requests, avgDurationMs: durationMs, memoryMb, arch },
  }).totalMonthly;

function finish(kind: string, options: Option[], notes: string[]): Comparison {
  const best = options.reduce((a, b) => (b.monthly < a.monthly ? b : a), options[0] as Option);
  return { kind, options, cheapest: best.label, notes };
}

/** Lambda memory sizes with the duration measured at each. More memory costs more per millisecond and often runs faster. */
export function compareLambdaMemory(
  requests: number,
  measured: ReadonlyArray<{ memoryMb: number; durationMs: number }>,
  arch: "x86" | "arm" = "x86",
): Comparison {
  const options = measured.map((point) => ({
    label: `${point.memoryMb} MB`,
    monthly: lambdaCost(requests, point.durationMs, point.memoryMb, arch),
    detail: `${point.durationMs} ms average`,
  }));
  return finish("lambda-memory", options, [
    "Lambda cost is billed duration times memory: doubling the memory is cheaper only if the duration falls by more than half.",
    "The durations are inputs you measured at each size; a duration you guessed makes this comparison meaningless.",
    "A larger size also gives more CPU and lowers latency, and a smaller one can hit timeouts or run out of memory: cost is not the only axis.",
  ]);
}

export function compareApiKind(requests: number): Comparison {
  const http = estimateWorkload({
    apiGateway: { kind: "http", requestsPerMonth: requests },
  }).totalMonthly;
  const rest = estimateWorkload({
    apiGateway: { kind: "rest", requestsPerMonth: requests },
  }).totalMonthly;
  return finish(
    "api-kind",
    [
      { label: "HTTP API", monthly: http, detail: "per-request price" },
      { label: "REST API", monthly: rest, detail: "per-request price" },
    ],
    [
      "REST APIs offer features HTTP APIs do not (API keys and usage plans, request validation, caching, WAF integration, private endpoints), so the cheaper option may not be a substitute.",
      "Caching, data transfer, and custom domains are not included.",
    ],
  );
}

export function compareArch(
  requests: number,
  memoryMb: number,
  x86DurationMs: number,
  armDurationMs: number,
): Comparison {
  return finish(
    "lambda-arch",
    [
      {
        label: "x86",
        monthly: lambdaCost(requests, x86DurationMs, memoryMb, "x86"),
        detail: `${x86DurationMs} ms`,
      },
      {
        label: "Graviton (arm64)",
        monthly: lambdaCost(requests, armDurationMs, memoryMb, "arm"),
        detail: `${armDurationMs} ms`,
      },
    ],
    [
      "The Graviton duration is an input: measure it, because it differs per workload (some are slower). Passing the same duration for both shows only the price difference.",
      "Switching needs code and dependencies that run on arm64.",
    ],
  );
}

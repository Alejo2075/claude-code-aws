// A deterministic model of a queue with workers. It answers "what does this design do under this
// load, if the numbers I gave are right"; it is a simulation of the model, never a measurement of AWS.
export interface QueueModel {
  arrivalRatePerSec: number;
  durationSec: number;
  serviceMsMean: number;
  /** 0 to 1: how far an individual service time may stray from the mean. */
  serviceJitter: number;
  workers: number;
  batchSize: number;
  batchOverheadMs: number;
  seed: number;
}

export interface QueueResult {
  messages: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  max_backlog: number;
  throughput_per_sec: number;
}

export const SIM_METRICS = [
  "p50_latency_ms",
  "p95_latency_ms",
  "p99_latency_ms",
  "max_backlog",
  "throughput_per_sec",
] as const;
export const MAX_MESSAGES = 200_000;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] ?? 0;
};

export function validateModel(m: QueueModel): string | null {
  const pos = (n: number): boolean => Number.isFinite(n) && n > 0;
  if (!pos(m.arrivalRatePerSec) || !pos(m.durationSec) || !pos(m.serviceMsMean))
    return "arrival rate, duration, and service time must be positive numbers";
  if (!Number.isInteger(m.workers) || m.workers < 1 || m.workers > 10_000)
    return "workers must be a whole number from 1 to 10000";
  if (!Number.isInteger(m.batchSize) || m.batchSize < 1 || m.batchSize > 10_000)
    return "batch size must be a whole number from 1 to 10000";
  if (m.serviceJitter < 0 || m.serviceJitter > 1 || m.batchOverheadMs < 0)
    return "jitter must be 0 to 1 and overhead cannot be negative";
  if (m.arrivalRatePerSec * m.durationSec > MAX_MESSAGES)
    return `the run would create more than ${MAX_MESSAGES} messages; shorten it`;
  return null;
}

export function simulateQueue(m: QueueModel): QueueResult {
  const rand = rng(m.seed);
  const arrivals: number[] = [];
  for (let t = 0; ;) {
    t += (-Math.log(1 - rand()) / m.arrivalRatePerSec) * 1000;
    if (t > m.durationSec * 1000) break;
    arrivals.push(t);
  }
  const service = (): number => m.serviceMsMean * (1 + (rand() * 2 - 1) * m.serviceJitter);
  const free = new Array<number>(m.workers).fill(0);
  const starts: number[] = [];
  const latencies: number[] = [];
  let next = 0;
  let lastDone = 0;
  while (next < arrivals.length) {
    let w = 0;
    for (let i = 1; i < free.length; i += 1) if ((free[i] ?? 0) < (free[w] ?? 0)) w = i;
    const t = Math.max(free[w] ?? 0, arrivals[next] ?? 0);
    let end = next + 1;
    while (end < arrivals.length && end - next < m.batchSize && (arrivals[end] ?? Infinity) <= t)
      end += 1;
    let cost = m.batchOverheadMs;
    for (let i = next; i < end; i += 1) cost += service();
    const done = t + cost;
    for (let i = next; i < end; i += 1) {
      latencies.push(done - (arrivals[i] ?? 0));
      starts.push(t);
    }
    free[w] = done;
    lastDone = Math.max(lastDone, done);
    next = end;
  }
  // Backlog: messages that have arrived but not started, sampled at each arrival.
  let maxBacklog = 0;
  let started = 0;
  const sortedStarts = [...starts].sort((a, b) => a - b);
  arrivals.forEach((at, i) => {
    while (started < sortedStarts.length && (sortedStarts[started] ?? Infinity) <= at) started += 1;
    maxBacklog = Math.max(maxBacklog, i + 1 - started);
  });
  const sorted = [...latencies].sort((a, b) => a - b);
  const round = (n: number): number => Math.round(n * 10) / 10;
  return {
    messages: arrivals.length,
    p50_latency_ms: round(percentile(sorted, 50)),
    p95_latency_ms: round(percentile(sorted, 95)),
    p99_latency_ms: round(percentile(sorted, 99)),
    max_backlog: maxBacklog,
    throughput_per_sec: lastDone === 0 ? 0 : round((arrivals.length / lastDone) * 1000),
  };
}

// Deterministic readings of Lambda logs and metrics. Every conclusion cites a ledger entry (what was
// queried, when, and what came back). Anything that cannot be established is written as a hypothesis
// with the next check that would settle it.
import { makeFinding, type Finding } from "@claude-code-aws/report-contract";
import { safeText } from "@claude-code-aws/safe-output";

import type { FunctionConfig, LogEvent, MetricSeries } from "./api.js";

export interface LedgerEntry {
  id: string;
  kind: "config" | "logs" | "metrics" | "alarms" | "queue";
  query: string;
  window: string;
  observedAt: string;
  result: string;
}

export interface ReportLine {
  at: number;
  requestId: string;
  durationMs: number | null;
  billedMs: number | null;
  memorySizeMb: number | null;
  maxMemoryMb: number | null;
  initMs: number | null;
}

const num = (match: RegExpExecArray | null): number | null =>
  match?.[1] === undefined ? null : Number(match[1]);

export function parseReportLine(event: LogEvent): ReportLine | null {
  if (!event.message.startsWith("REPORT RequestId:")) return null;
  const m = event.message;
  return {
    at: event.at,
    requestId: /RequestId:\s*([0-9a-f-]+)/i.exec(m)?.[1] ?? "",
    durationMs: num(/\bDuration:\s*([\d.]+)\s*ms/.exec(m)),
    billedMs: num(/Billed Duration:\s*([\d.]+)\s*ms/.exec(m)),
    memorySizeMb: num(/Memory Size:\s*(\d+)\s*MB/.exec(m)),
    maxMemoryMb: num(/Max Memory Used:\s*(\d+)\s*MB/.exec(m)),
    initMs: num(/Init Duration:\s*([\d.]+)\s*ms/.exec(m)),
  };
}

export interface LogReading {
  reports: ReportLine[];
  timeouts: LogEvent[];
  outOfMemory: LogEvent[];
  errors: LogEvent[];
  errorTypes: Array<{ type: string; count: number }>;
  coldStarts: number;
}

const TIMEOUT = /Task timed out after [\d.]+ seconds/;
const OOM = /Runtime\.OutOfMemory|signal: killed|Runtime exited with error: signal: killed/;
const ERROR_LINE =
  /\b(ERROR|Error:|Exception|Unhandled|Traceback)\b|"level"\s*:\s*"(?:ERROR|FATAL)"/;
const ERROR_TYPE = /\b([A-Z][A-Za-z0-9]*(?:Error|Exception))\b/;

export function readLogs(events: readonly LogEvent[]): LogReading {
  const reading: LogReading = {
    reports: [],
    timeouts: [],
    outOfMemory: [],
    errors: [],
    errorTypes: [],
    coldStarts: 0,
  };
  const types = new Map<string, number>();
  for (const event of events) {
    const report = parseReportLine(event);
    if (report !== null) {
      reading.reports.push(report);
      if (report.initMs !== null) reading.coldStarts += 1;
      continue;
    }
    if (TIMEOUT.test(event.message)) reading.timeouts.push(event);
    else if (OOM.test(event.message)) reading.outOfMemory.push(event);
    else if (ERROR_LINE.test(event.message)) {
      reading.errors.push(event);
      const type = ERROR_TYPE.exec(event.message)?.[1] ?? "unclassified";
      types.set(type, (types.get(type) ?? 0) + 1);
    }
  }
  reading.errorTypes = [...types.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return reading;
}

const sum = (series: MetricSeries | undefined): number =>
  (series?.points ?? []).reduce((total, point) => total + point.v, 0);
const maxOf = (series: MetricSeries | undefined): number =>
  (series?.points ?? []).reduce((best, point) => Math.max(best, point.v), 0);

export interface AnalysisInput {
  config: FunctionConfig;
  reading: LogReading | null;
  logEntry: string | null;
  configEntry: string;
  metricEntry: string | null;
  metrics: Map<string, MetricSeries>;
  logsTruncated: boolean;
}

/** Findings from the evidence in hand. Each one lists the ledger entries that support it. */
export function analyze(input: AnalysisInput): Finding[] {
  const { config, reading } = input;
  const findings: Finding[] = [];
  const base = {
    plugin: "aws-observability",
    source: "account" as const,
    subject: config.name,
    affectedResources: [config.name],
  };
  const evidence = (...ids: Array<string | null>) =>
    ids.filter((id): id is string => id !== null).map((id) => ({ type: "ledger", reference: id }));

  const timeouts = reading?.timeouts.length ?? 0;
  const metricTimeouts =
    input.metrics.get("duration_max") !== undefined &&
    config.timeoutSeconds !== null &&
    maxOf(input.metrics.get("duration_max")) >= config.timeoutSeconds * 1000 * 0.98
      ? 1
      : 0;
  if (timeouts > 0 || metricTimeouts > 0) {
    findings.push(
      makeFinding({
        ...base,
        ruleId: "OBS-LAMBDA-TIMEOUT",
        severity: "high",
        status: "confirmed",
        title: "The function is hitting its timeout",
        explanation: `${timeouts > 0 ? `${timeouts} log line(s) say "Task timed out" (configured timeout ${config.timeoutSeconds ?? "?"}s). ` : ""}${metricTimeouts > 0 ? `The maximum duration in the window reached the timeout. ` : ""}The logs and metrics show that invocations are cut off; they do not show why the work is slow.`,
        recommendation:
          "Find what the handler waits for (a downstream call, a cold dependency, a large payload); raise the timeout only if the work is legitimately longer, and keep it below any caller's timeout.",
        evidence: evidence(input.logEntry, input.metricEntry, input.configEntry),
      }),
    );
  }
  if (
    (reading?.outOfMemory.length ?? 0) > 0 ||
    (reading?.reports ?? []).some(
      (r) => r.maxMemoryMb !== null && r.memorySizeMb !== null && r.maxMemoryMb >= r.memorySizeMb,
    )
  ) {
    findings.push(
      makeFinding({
        ...base,
        ruleId: "OBS-LAMBDA-MEMORY",
        severity: "high",
        status: "confirmed",
        title: "The function ran out of memory or used all of it",
        explanation: `${reading?.outOfMemory.length ?? 0} out-of-memory line(s), and ${(reading?.reports ?? []).filter((r) => r.maxMemoryMb !== null && r.memorySizeMb !== null && r.maxMemoryMb >= r.memorySizeMb).length} invocation(s) that used the whole ${config.memoryMb ?? "?"} MB.`,
        recommendation:
          "Raise the memory setting, or reduce what a single invocation loads. More memory also gives more CPU, which can shorten the duration.",
        evidence: evidence(input.logEntry, input.configEntry),
      }),
    );
  }
  const throttles = sum(input.metrics.get("throttles"));
  if (throttles > 0) {
    findings.push(
      makeFinding({
        ...base,
        ruleId: "OBS-LAMBDA-THROTTLED",
        severity: "high",
        status: "confirmed",
        title: "Invocations were throttled",
        explanation: `${throttles} throttled invocation(s) in the window. Lambda rejected them before running the code, because a concurrency limit was reached.`,
        recommendation:
          "Check reserved concurrency on this function and the account's concurrency quota; for queue consumers, the event source mapping's maximum concurrency.",
        evidence: evidence(input.metricEntry),
      }),
    );
  }
  const errors = sum(input.metrics.get("errors"));
  const invocations = sum(input.metrics.get("invocations"));
  if (errors > 0) {
    const rate = invocations > 0 ? Math.round((errors / invocations) * 1000) / 10 : null;
    const top = reading?.errorTypes
      .slice(0, 3)
      .map((t) => `${t.type} (${t.count})`)
      .join(", ");
    findings.push(
      makeFinding({
        ...base,
        ruleId: "OBS-LAMBDA-ERRORS",
        severity: rate !== null && rate >= 5 ? "high" : "medium",
        status: "confirmed",
        title: "The function reported errors",
        explanation: `${errors} error(s) in ${invocations} invocation(s)${rate === null ? "" : ` (${rate}%)`}.${top === undefined || top === "" ? "" : ` The most common error types in the sampled logs: ${top}.`} The error count comes from CloudWatch; the types come from a bounded sample of the logs.`,
        recommendation:
          "Read the sampled error lines with `logs --filter ERROR`, and check what changed at the time the errors started.",
        evidence: evidence(input.metricEntry, input.logEntry),
      }),
    );
  }
  const cold = reading?.coldStarts ?? 0;
  if (reading !== null && reading.reports.length > 0 && cold / reading.reports.length >= 0.3) {
    findings.push(
      makeFinding({
        ...base,
        ruleId: "OBS-LAMBDA-COLD-STARTS",
        severity: "low",
        status: "informational",
        title: "Many invocations started cold",
        explanation: `${cold} of ${reading.reports.length} sampled invocations show an Init Duration (a cold start).`,
        recommendation:
          "If latency matters, consider provisioned concurrency or a smaller deployment package; weigh the cost.",
        evidence: evidence(input.logEntry),
      }),
    );
  }
  if (config.tracing !== "Active") {
    findings.push(
      makeFinding({
        ...base,
        ruleId: "OBS-NO-TRACING",
        severity: "info",
        status: "informational",
        title: "Active tracing is off",
        explanation:
          "Without active X-Ray tracing, following one request across services depends on logs and correlation ids. This version does not read X-Ray traces.",
        recommendation:
          "Enable active tracing, or propagate a correlation id through every call and log line.",
        evidence: evidence(input.configEntry),
      }),
    );
  }
  if (input.logsTruncated) {
    findings.push(
      makeFinding({
        ...base,
        ruleId: "OBS-LOGS-SAMPLED",
        severity: "info",
        status: "informational",
        title: "The log sample is incomplete",
        explanation:
          "The log query hit its event or page limit, so the counts taken from the logs are lower bounds.",
        evidence: evidence(input.logEntry),
      }),
    );
  }
  return findings;
}

/** Log lines, redacted and bounded, for display. */
export function sampleLines(events: readonly LogEvent[], limit: number): string[] {
  return events.slice(0, limit).map((event) => {
    const text = safeText(event.message.trim(), { maxLines: 1, maxLineLength: 300 }).text;
    return `${new Date(event.at).toISOString()}  ${text}`;
  });
}

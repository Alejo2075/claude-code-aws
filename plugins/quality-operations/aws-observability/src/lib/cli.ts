import { classifyError } from "@claude-code-aws/aws-client";
import { isValidRegion } from "@claude-code-aws/context-contract";
import {
  buildReport,
  type ExecutionContext,
  type Finding,
  makeFinding,
  renderReport,
  type TimeSeries,
} from "@claude-code-aws/report-contract";
import { safeText } from "@claude-code-aws/safe-output";

import { analyze, type LedgerEntry, readLogs, sampleLines } from "./analyze.js";
import type { MetricSeries, MetricSpec, ObsApi } from "./api.js";
import {
  DEFAULT_LOG_EVENTS,
  MAX_ALARMS,
  MAX_LOG_EVENTS,
  MAX_LOG_PAGES,
  NAME,
  parseSince,
  periodFor,
  QUEUE_NAME,
} from "./bounds.js";

export const USAGE = `Usage: aws-observability <command> [options]

  status  --function <name> | --queue <name>         Health now: configuration, recent metrics, queue and DLQ depth
  logs    --function <name> [--since 1h] [--filter <pattern>] [--limit 100]   Bounded log sample, redacted
  metrics --function <name> | --queue <name> [--since 1h]                      Standard metrics as time series
  alarms  [--prefix <text>] [--state ALARM|OK|INSUFFICIENT_DATA]               Alarm inventory (creates nothing)
  trace   --function <name>                          Whether tracing is on (X-Ray traces are not read yet)
  investigate --function <name> [--since 1h]         An evidence ledger and findings that cite it

Options: --region <region>   --json   (time ranges: 1m to 24h; log samples: at most ${MAX_LOG_EVENTS} events)

Read-only. Each command makes a fixed, small number of billed API calls and says how many.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

export interface CliDeps {
  api: (region: string) => ObsApi;
  sdkRegion: () => Promise<string | null>;
  fallbackRegion: string | null;
  known: () => {
    accountId: string;
    environment: ExecutionContext["environment"];
    profile: string | null;
  } | null;
  now?: Date;
}

const hasControl = (text: string): boolean =>
  Array.from(text).some((char) => char.charCodeAt(0) < 0x20);

const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const plain = (text: string): string =>
  safeText(text, { maxLines: 500, maxLineLength: 500, maxChars: 100_000 }, { personalData: false })
    .text;

const FAILURES: Record<string, string> = {
  NO_CREDENTIALS:
    "No AWS credentials were found. Configure a profile or environment credentials yourself, then retry.",
  SSO_EXPIRED:
    "The AWS session expired. Sign in yourself (for example `aws sso login`), then retry.",
  CREDENTIALS_EXPIRED: "The AWS session expired. Sign in yourself, then retry.",
  CREDENTIALS_INVALID: "AWS rejected the credentials. Check which credentials are active.",
  OFFLINE: "AWS could not be reached.",
  TIMEOUT: "AWS did not answer in time.",
};

function failureText(error: unknown): string {
  const name = (error as { name?: string }).name ?? "";
  const message = (error as { message?: string }).message ?? "";
  if (/^(AccessDenied|AccessDeniedException)$/.test(name)) {
    const action = /perform:\s*([A-Za-z0-9-]+:[A-Za-z0-9*]+)/.exec(message)?.[1];
    return `The active identity is not allowed to make this read call.${action === undefined ? "" : ` Missing permission: ${action}`}`;
  }
  if (
    name === "ResourceNotFoundException" ||
    name === "QueueDoesNotExist" ||
    name === "AWS.SimpleQueueService.NonExistentQueue"
  )
    return "That resource does not exist in this account and region. Check the name and the region.";
  if (/^(Throttling|ThrottlingException|TooManyRequestsException)$/.test(name))
    return "AWS throttled the requests even after retries. Wait a moment and retry with a shorter range.";
  return FAILURES[classifyError(error).code] ?? "The call failed for an unrecognized reason.";
}

function lambdaMetrics(name: string): MetricSpec[] {
  const dimensions = { FunctionName: name };
  return [
    { id: "invocations", namespace: "AWS/Lambda", metric: "Invocations", stat: "Sum", dimensions },
    { id: "errors", namespace: "AWS/Lambda", metric: "Errors", stat: "Sum", dimensions },
    { id: "throttles", namespace: "AWS/Lambda", metric: "Throttles", stat: "Sum", dimensions },
    {
      id: "duration_max",
      namespace: "AWS/Lambda",
      metric: "Duration",
      stat: "Maximum",
      dimensions,
    },
    { id: "duration_p99", namespace: "AWS/Lambda", metric: "Duration", stat: "p99", dimensions },
    {
      id: "concurrent",
      namespace: "AWS/Lambda",
      metric: "ConcurrentExecutions",
      stat: "Maximum",
      dimensions,
    },
  ];
}

function queueMetrics(name: string): MetricSpec[] {
  const dimensions = { QueueName: name };
  return [
    {
      id: "age",
      namespace: "AWS/SQS",
      metric: "ApproximateAgeOfOldestMessage",
      stat: "Maximum",
      dimensions,
    },
    {
      id: "visible",
      namespace: "AWS/SQS",
      metric: "ApproximateNumberOfMessagesVisible",
      stat: "Maximum",
      dimensions,
    },
  ];
}

const sumOf = (series: MetricSeries | undefined): number =>
  (series?.points ?? []).reduce((total, point) => total + point.v, 0);
const maxOf = (series: MetricSeries | undefined): number =>
  (series?.points ?? []).reduce((best, point) => Math.max(best, point.v), 0);

function toSeries(
  spec: MetricSpec,
  series: MetricSeries | undefined,
  startMs: number,
  endMs: number,
  period: number,
): TimeSeries {
  return {
    schemaVersion: "1",
    namespace: spec.namespace,
    metric: spec.metric,
    statistic: spec.stat,
    unit:
      spec.metric === "Duration"
        ? "Milliseconds"
        : spec.metric.includes("Age")
          ? "Seconds"
          : "Count",
    periodSeconds: period,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    dimensions: spec.dimensions,
    points: (series?.points ?? []).map((point) => ({ t: point.t, v: point.v })),
  };
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  const options = new Map<string, string | true>();
  const words: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "json") options.set("json", true);
    else if (
      ["function", "queue", "since", "filter", "limit", "prefix", "state", "region"].includes(name)
    ) {
      const value = argv[i + 1];
      if (value === undefined) return usageError(`--${name} needs a value`);
      options.set(name, value);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = options.has("json");
  const [command, extra] = words;
  if (extra !== undefined) return usageError("too many arguments");
  if (!["status", "logs", "metrics", "alarms", "trace", "investigate"].includes(command ?? ""))
    return { exitCode: 2, stdout: USAGE };
  const fn =
    typeof options.get("function") === "string" ? String(options.get("function")) : undefined;
  const queue = typeof options.get("queue") === "string" ? String(options.get("queue")) : undefined;
  if (fn !== undefined && !NAME.test(fn))
    return usageError("--function is not a valid function name");
  if (queue !== undefined && !QUEUE_NAME.test(queue))
    return usageError("--queue must be the queue name, not its URL");
  const minutes = parseSince(
    typeof options.get("since") === "string" ? String(options.get("since")) : undefined,
  );
  if (minutes === null)
    return usageError("--since must be like 15m, 2h, or 1d, from 1 minute to 24 hours");
  const limitText = options.get("limit");
  const limit =
    limitText === undefined
      ? DEFAULT_LOG_EVENTS
      : /^\d{1,3}$/.test(String(limitText))
        ? Number(limitText)
        : 0;
  if (limit < 1 || limit > MAX_LOG_EVENTS)
    return usageError(`--limit must be from 1 to ${MAX_LOG_EVENTS}`);
  const filterText =
    typeof options.get("filter") === "string" ? String(options.get("filter")) : undefined;
  if (filterText !== undefined && (filterText.length > 200 || hasControl(filterText)))
    return usageError("--filter is too long or contains control characters");
  const stateText =
    typeof options.get("state") === "string" ? String(options.get("state")) : undefined;
  if (stateText !== undefined && !["ALARM", "OK", "INSUFFICIENT_DATA"].includes(stateText))
    return usageError("--state must be ALARM, OK, or INSUFFICIENT_DATA");
  const regionOption = options.get("region");
  if (
    regionOption !== undefined &&
    (typeof regionOption !== "string" || !isValidRegion(regionOption))
  )
    return usageError("--region is not a valid region name");
  const needsTarget = ["logs", "trace", "investigate"].includes(command ?? "")
    ? fn === undefined
    : ["status", "metrics"].includes(command ?? "")
      ? fn === undefined && queue === undefined
      : false;
  if (needsTarget)
    return usageError(
      `${command ?? ""} needs ${["status", "metrics"].includes(command ?? "") ? "--function or --queue" : "--function"}`,
    );
  if (fn !== undefined && queue !== undefined)
    return usageError("give --function or --queue, not both");

  const region =
    typeof regionOption === "string"
      ? regionOption
      : ((await deps.sdkRegion()) ?? deps.fallbackRegion);
  if (region === null)
    return {
      exitCode: 0,
      stdout: "No region is set. Pass --region <region>, or set AWS_REGION or a profile region.",
    };
  const now = deps.now ?? new Date();
  const endMs = now.getTime();
  const startMs = endMs - minutes * 60_000;
  const window = `${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()}`;
  const api = deps.api(region);
  let calls = 0;
  const counted = <T>(promise: Promise<T>): Promise<T> => {
    calls += 1;
    return promise;
  };
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : plain(text),
  });
  const costNote = () =>
    `This run made ${calls} billed AWS API call(s) (read-only). CloudWatch charges for API requests and for metrics requested; it is not a Logs Insights scan.`;

  try {
    let context: ExecutionContext;
    try {
      const identity = await api.identity();
      const known = deps.known();
      context = {
        accountId: identity.accountId,
        region,
        profile: known?.accountId === identity.accountId ? known.profile : null,
        identityVerified: true,
        environment: known?.accountId === identity.accountId ? known.environment : "unknown",
      };
    } catch (error) {
      return print({ error: "IDENTITY" }, failureText(error));
    }
    const ledger: LedgerEntry[] = [];
    const entry = (
      kind: LedgerEntry["kind"],
      query: string,
      result: string,
      win = window,
    ): string => {
      const id = `E${ledger.length + 1}`;
      ledger.push({ id, kind, query, window: win, observedAt: now.toISOString(), result });
      return id;
    };
    const report = (summary: string, findings: Finding[], extra: string[] = []) =>
      buildReport({
        plugin: "aws-observability",
        context,
        mode: "read-only-cloud",
        summary,
        findings,
        limitations: [
          "Reads CloudWatch, Lambda, and SQS in one account and region. Absence of data is not proof that nothing happened: metrics lag by about a minute and logs can be delayed or sampled.",
          ...extra,
          costNote(),
        ],
        now,
      });
    const ledgerText = (): string =>
      [
        "Evidence ledger:",
        ...ledger.map(
          (e) =>
            `  ${e.id} [${e.kind}] ${e.query} (${e.window === "" ? "now" : e.window}, read ${e.observedAt}): ${e.result}`,
        ),
      ].join("\n");

    switch (command) {
      case "alarms": {
        const prefix =
          typeof options.get("prefix") === "string" ? String(options.get("prefix")) : undefined;
        const state =
          typeof options.get("state") === "string" ? String(options.get("state")) : undefined;
        if (state !== undefined && !["ALARM", "OK", "INSUFFICIENT_DATA"].includes(state))
          return usageError("--state must be ALARM, OK, or INSUFFICIENT_DATA");
        const alarms = await counted(api.alarms(prefix, state, MAX_ALARMS));
        const text =
          alarms.length === 0
            ? "No alarms matched in this account and region. That does not mean none exist elsewhere."
            : alarms
                .map(
                  (a) =>
                    `${a.state.padEnd(18)} ${a.name}${a.metric === null ? "" : ` (${a.metric})`}${a.state === "ALARM" && a.reason !== null ? `\n    ${a.reason}` : ""}`,
                )
                .join("\n");
        return print(
          { alarms, limit: MAX_ALARMS },
          `${text}${alarms.length >= MAX_ALARMS ? `\n\nShowing the first ${MAX_ALARMS}; narrow with --prefix.` : ""}\n\n${costNote()}`,
        );
      }

      case "trace": {
        const config = await counted(api.getFunction(fn ?? ""));
        const on = config.tracing === "Active";
        return print(
          { function: config.name, tracing: config.tracing },
          `${config.name}: tracing is ${on ? "ACTIVE" : `not active (${config.tracing ?? "unset"})`}.\n${on ? "X-Ray receives traces for this function, but this version does not read them: use the X-Ray console or `aws xray get-trace-summaries`." : "Without it, following one request across services depends on logs and a correlation id that your code propagates."}\n\n${costNote()}`,
        );
      }

      case "logs": {
        const pattern =
          typeof options.get("filter") === "string" ? String(options.get("filter")) : undefined;
        if (pattern !== undefined && (pattern.length > 200 || hasControl(pattern)))
          return usageError("--filter is too long or contains control characters");
        const result = await counted(
          api.filterLogs(`/aws/lambda/${fn ?? ""}`, startMs, endMs, pattern, limit, MAX_LOG_PAGES),
        );
        if (result.missingGroup)
          return print(
            { found: false },
            `There is no log group /aws/lambda/${fn ?? ""} in this account and region: the function has never run here, or it logs elsewhere.\n\n${costNote()}`,
          );
        const lines = sampleLines(result.events, limit);
        return print(
          { events: lines, truncated: result.truncated },
          `${lines.length} log line(s) from ${window}${pattern === undefined ? "" : ` matching ${pattern}`}, redacted and shortened.\n\n${lines.join("\n")}\n\n${result.truncated ? `The sample stopped at ${limit} events or ${MAX_LOG_PAGES} pages; there is more. Narrow --since or --filter.\n` : ""}${costNote()}`,
        );
      }

      case "metrics": {
        const specs = fn !== undefined ? lambdaMetrics(fn) : queueMetrics(queue ?? "");
        const period = periodFor(minutes);
        const results = await counted(api.metrics(specs, startMs, endMs, period));
        const byId = new Map(results.map((r) => [r.id, r]));
        const series = specs.map((spec) =>
          toSeries(spec, byId.get(spec.id), startMs, endMs, period),
        );
        const lines = specs.map((spec) => {
          const found = byId.get(spec.id);
          const total = spec.stat === "Sum" ? `total ${sumOf(found)}` : `peak ${maxOf(found)}`;
          return `  ${spec.metric} ${spec.stat}: ${found === undefined || found.points.length === 0 ? "no data points" : `${found.points.length} points, ${total}`}`;
        });
        return print(
          { series },
          `Metrics for ${fn ?? queue ?? ""}, ${window}, period ${period}s:\n${lines.join("\n")}\n\nNo data points can mean no traffic or a metric that has not been published yet; it is not proof that nothing ran.\n\n${costNote()}`,
        );
      }

      case "status":
      case "investigate": {
        if (fn === undefined) {
          const info = await counted(api.queue(queue ?? ""));
          const specs = queueMetrics(queue ?? "");
          const metricResults = await counted(
            api.metrics(specs, startMs, endMs, periodFor(minutes)),
          );
          const age = maxOf(metricResults.find((r) => r.id === "age"));
          const qEntry = entry(
            "queue",
            `get-queue-attributes ${queue ?? ""}`,
            `visible ${info.visible ?? "?"}, in flight ${info.inFlight ?? "?"}, delayed ${info.delayed ?? "?"}, visibility timeout ${info.visibilityTimeoutSeconds ?? "?"}s`,
            "",
          );
          const mEntry = entry(
            "metrics",
            `AWS/SQS ApproximateAgeOfOldestMessage for ${queue ?? ""}`,
            `oldest message age peak ${age}s`,
          );
          const findings: Finding[] = [];
          let dlqText = "no dead-letter queue configured";
          if (info.deadLetterTarget !== null) {
            const dlqName = info.deadLetterTarget.split(":").at(-1) ?? "";
            try {
              const dlq = await counted(api.queue(dlqName));
              const dEntry = entry(
                "queue",
                `get-queue-attributes ${dlqName}`,
                `visible ${dlq.visible ?? "?"}`,
                "",
              );
              dlqText = `dead-letter queue ${dlqName} holds ${dlq.visible ?? "?"} message(s)`;
              if ((dlq.visible ?? 0) > 0) {
                findings.push(
                  makeFinding({
                    plugin: "aws-observability",
                    ruleId: "OBS-DLQ-MESSAGES",
                    severity: "high",
                    status: "confirmed",
                    source: "account",
                    title: "Messages are in the dead-letter queue",
                    explanation: `${dlqName} holds ${dlq.visible} message(s): they failed processing ${info.maxReceiveCount ?? "several"} times. The count is approximate and the reason each failed is in the consumer's logs, not here.`,
                    recommendation:
                      "Read a sample of the messages and the consumer's errors for the time they arrived; fix the cause before redriving.",
                    subject: dlqName,
                    affectedResources: [dlqName],
                    evidence: [{ type: "ledger", reference: dEntry }],
                  }),
                );
              }
            } catch (error) {
              dlqText = `dead-letter queue ${dlqName} could not be read: ${failureText(error)}`;
            }
          } else {
            findings.push(
              makeFinding({
                plugin: "aws-observability",
                ruleId: "OBS-NO-DLQ",
                severity: "medium",
                status: "confirmed",
                source: "account",
                title: "The queue has no dead-letter queue",
                explanation:
                  "A message that keeps failing is retried until it expires, with nowhere to inspect it.",
                subject: queue ?? "",
                affectedResources: [queue ?? ""],
                evidence: [{ type: "ledger", reference: qEntry }],
              }),
            );
          }
          if (age > 0 && (info.visible ?? 0) > 0) {
            findings.push(
              makeFinding({
                plugin: "aws-observability",
                ruleId: "OBS-QUEUE-BACKLOG",
                severity: age > 300 ? "high" : "info",
                status: age > 300 ? "confirmed" : "informational",
                source: "account",
                title: "The queue has a backlog",
                explanation: `${info.visible} visible message(s); the oldest waited up to ${age}s in the window. A backlog means consumers are slower than producers, or stopped; this does not say which. Check the consumer's errors, throttles, and concurrency.`,
                recommendation:
                  "Run `status --function <consumer>` for the function that reads this queue.",
                subject: queue ?? "",
                affectedResources: [queue ?? ""],
                evidence: [
                  { type: "ledger", reference: mEntry },
                  { type: "ledger", reference: qEntry },
                ],
              }),
            );
          }
          const r = report(
            `${queue ?? ""}: ${info.visible ?? "?"} visible, ${info.inFlight ?? "?"} in flight; ${dlqText}.`,
            findings,
          );
          return print({ report: r, ledger, queue: info }, `${renderReport(r)}\n\n${ledgerText()}`);
        }

        const config = await counted(api.getFunction(fn));
        const cEntry = entry(
          "config",
          `get-function-configuration ${fn}`,
          `${config.runtime ?? "?"}, timeout ${config.timeoutSeconds ?? "?"}s, memory ${config.memoryMb ?? "?"} MB, tracing ${config.tracing ?? "?"}`,
          "",
        );
        const period = periodFor(minutes);
        const results = await counted(api.metrics(lambdaMetrics(fn), startMs, endMs, period));
        const byId = new Map(results.map((r) => [r.id, r]));
        const mEntry = entry(
          "metrics",
          `AWS/Lambda ${fn}`,
          `invocations ${sumOf(byId.get("invocations"))}, errors ${sumOf(byId.get("errors"))}, throttles ${sumOf(byId.get("throttles"))}, max duration ${maxOf(byId.get("duration_max"))} ms, peak concurrency ${maxOf(byId.get("concurrent"))}`,
        );
        let reading = null as ReturnType<typeof readLogs> | null;
        let logEntry: string | null = null;
        let truncated = false;
        if (command === "investigate") {
          const logs = await counted(
            api.filterLogs(
              `/aws/lambda/${fn}`,
              startMs,
              endMs,
              '?REPORT ?"Task timed out" ?ERROR ?Exception ?OutOfMemory',
              MAX_LOG_EVENTS,
              MAX_LOG_PAGES,
            ),
          );
          if (logs.missingGroup)
            logEntry = entry("logs", `/aws/lambda/${fn}`, "the log group does not exist");
          else {
            reading = readLogs(logs.events);
            truncated = logs.truncated;
            logEntry = entry(
              "logs",
              `filter REPORT/timeout/error/OOM in /aws/lambda/${fn}`,
              `${logs.events.length} event(s): ${reading.reports.length} REPORT, ${reading.timeouts.length} timeout, ${reading.outOfMemory.length} out-of-memory, ${reading.errors.length} error line(s)${truncated ? " (sample cut at the limit)" : ""}`,
            );
          }
        }
        const findings = analyze({
          config,
          reading,
          logEntry,
          configEntry: cEntry,
          metricEntry: mEntry,
          metrics: byId,
          logsTruncated: truncated,
        });
        const errors = sumOf(byId.get("errors"));
        const summary = `${fn}: ${sumOf(byId.get("invocations"))} invocation(s), ${errors} error(s), ${sumOf(byId.get("throttles"))} throttle(s) in ${window}.${command === "status" ? " Use `investigate` to read the logs." : ""}`;
        const r = report(
          summary,
          findings,
          command === "investigate"
            ? [
                "`investigate` reads a bounded, filtered sample of the logs: counts from the logs are lower bounds. It does not read X-Ray traces, downstream services, or deployments, so it can show what happened to this function and not, by itself, why.",
              ]
            : [],
        );
        return print(
          {
            report: r,
            ledger,
            series:
              command === "status"
                ? lambdaMetrics(fn).map((spec) =>
                    toSeries(spec, byId.get(spec.id), startMs, endMs, period),
                  )
                : undefined,
          },
          `${renderReport(r)}\n\n${ledgerText()}`,
        );
      }
    }
    return { exitCode: 2, stdout: USAGE };
  } catch (error) {
    return print({ error: "AWS_CALL_FAILED" }, failureText(error));
  } finally {
    api.close();
  }
}

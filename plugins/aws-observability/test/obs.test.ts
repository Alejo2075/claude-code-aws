import { describe, expect, it } from "vitest";

import { analyze, parseReportLine, readLogs, sampleLines } from "../src/lib/analyze.js";
import type {
  AlarmInfo,
  FunctionConfig,
  LogEvent,
  MetricSeries,
  ObsApi,
  QueueInfo,
} from "../src/lib/api.js";
import { parseSince, periodFor } from "../src/lib/bounds.js";
import { type CliDeps, runCli } from "../src/lib/cli.js";

const NOW = new Date("2026-10-31T12:00:00Z");
const REPORT = (duration: number, memory: number, init?: number): string =>
  `REPORT RequestId: 7a1c0000-0000-4000-8000-000000000001\tDuration: ${duration} ms\tBilled Duration: ${Math.ceil(duration)} ms\tMemory Size: 128 MB\tMax Memory Used: ${memory} MB${init === undefined ? "" : `\tInit Duration: ${init} ms`}`;
const log = (message: string, at = NOW.getTime() - 60_000): LogEvent => ({
  at,
  stream: "s",
  message,
});
const series = (id: string, values: number[]): MetricSeries => ({
  id,
  points: values.map((v, i) => ({
    t: new Date(NOW.getTime() - (values.length - i) * 60_000).toISOString(),
    v,
  })),
});

interface Fake {
  api: ObsApi;
  calls: string[];
}

function fake(
  overrides: Partial<{
    fn: FunctionConfig;
    logs: LogEvent[];
    truncated: boolean;
    missingGroup: boolean;
    metrics: MetricSeries[];
    queues: Record<string, QueueInfo>;
    alarms: AlarmInfo[];
    fail: Error;
  }> = {},
): Fake {
  const calls: string[] = [];
  const config: FunctionConfig = overrides.fn ?? {
    name: "orders",
    runtime: "nodejs22.x",
    timeoutSeconds: 3,
    memoryMb: 128,
    tracing: "PassThrough",
    lastModified: null,
    deadLetterTarget: null,
  };
  const reject = <T>(): Promise<T> | null =>
    overrides.fail === undefined ? null : Promise.reject(overrides.fail);
  const api: ObsApi = {
    identity: () =>
      Promise.resolve({
        accountId: "123456789012",
        arn: "arn:aws:sts::123456789012:assumed-role/Dev/carol",
      }),
    getFunction: () => {
      calls.push("getFunction");
      return reject<FunctionConfig>() ?? Promise.resolve(config);
    },
    filterLogs: (group, _s, _e, pattern, limit, pages) => {
      calls.push(`filterLogs:${group}:${pattern ?? ""}:${limit}:${pages}`);
      return Promise.resolve({
        events: overrides.logs ?? [],
        truncated: overrides.truncated ?? false,
        missingGroup: overrides.missingGroup ?? false,
      });
    },
    metrics: (specs) => {
      calls.push(`metrics:${specs.length}`);
      return Promise.resolve(overrides.metrics ?? []);
    },
    alarms: (prefix, state, limit) => {
      calls.push(`alarms:${prefix ?? ""}:${state ?? ""}:${limit}`);
      return Promise.resolve(overrides.alarms ?? []);
    },
    queue: (name) => {
      calls.push(`queue:${name}`);
      const info = overrides.queues?.[name];
      return info === undefined
        ? Promise.reject(Object.assign(new Error("x"), { name: "QueueDoesNotExist" }))
        : Promise.resolve(info);
    },
    close: () => {
      calls.push("close");
    },
  };
  return { api, calls };
}

const deps = (api: ObsApi, extra: Partial<CliDeps> = {}): CliDeps => ({
  api: () => api,
  sdkRegion: () => Promise.resolve("us-east-1"),
  fallbackRegion: null,
  known: () => null,
  now: NOW,
  ...extra,
});
const jsonOf = (text: string): Record<string, unknown> =>
  JSON.parse(text) as Record<string, unknown>;

describe("bounds", () => {
  it("parses ranges from a minute to a day and rejects the rest", () => {
    expect(parseSince(undefined)).toBe(60);
    expect(parseSince("15m")).toBe(15);
    expect(parseSince("2h")).toBe(120);
    expect(parseSince("1d")).toBe(1440);
    for (const bad of ["25h", "2d", "0m", "-1h", "h", "10", "1w", "999m1"])
      expect(parseSince(bad)).toBeNull();
    expect(periodFor(30)).toBe(60);
    expect(periodFor(120)).toBe(300);
    expect(periodFor(1440)).toBe(900);
  });
});

describe("log reading", () => {
  it("parses REPORT lines", () => {
    const line = parseReportLine(log(REPORT(2999.5, 120, 210.4)));
    expect(line).toMatchObject({
      durationMs: 2999.5,
      memorySizeMb: 128,
      maxMemoryMb: 120,
      initMs: 210.4,
    });
    expect(parseReportLine(log("START RequestId: x"))).toBeNull();
  });

  it("separates timeouts, out-of-memory, error lines and counts error types and cold starts", () => {
    const reading = readLogs([
      log(REPORT(20, 50, 300)),
      log(REPORT(30, 50)),
      log("2026-01-01T00:00:00Z 7a1c Task timed out after 3.00 seconds"),
      log("Runtime exited with error: signal: killed Runtime.OutOfMemory"),
      log("ERROR TypeError: x is undefined"),
      log("ERROR TypeError: y is undefined"),
      log('{"level":"ERROR","message":"ValidationException from dynamodb"}'),
      log("INFO all good"),
    ]);
    expect(reading).toMatchObject({ coldStarts: 1 });
    expect(reading.timeouts).toHaveLength(1);
    expect(reading.outOfMemory).toHaveLength(1);
    expect(reading.errorTypes).toEqual([
      { type: "TypeError", count: 2 },
      { type: "ValidationException", count: 1 },
    ]);
  });

  it("redacts and shortens the sample", () => {
    const [line] = sampleLines(
      [log(`ERROR password=hunter2hunter2 for carol@example.com ${"x".repeat(900)}`)],
      5,
    );
    expect(line).not.toContain("hunter2hunter2");
    expect(line).not.toContain("carol@example.com");
    expect((line ?? "").length).toBeLessThan(400);
  });
});

describe("analyze", () => {
  const config: FunctionConfig = {
    name: "orders",
    runtime: "nodejs22.x",
    timeoutSeconds: 3,
    memoryMb: 128,
    tracing: "PassThrough",
    lastModified: null,
    deadLetterTarget: null,
  };
  const run = (logs: LogEvent[], metrics: MetricSeries[]) =>
    analyze({
      config,
      reading: readLogs(logs),
      logEntry: "E3",
      configEntry: "E1",
      metricEntry: "E2",
      metrics: new Map(metrics.map((m) => [m.id, m])),
      logsTruncated: false,
    });

  it("confirms a timeout from the log line and cites the ledger entries", () => {
    const findings = run([log("Task timed out after 3.00 seconds")], []);
    const timeout = findings.find((f) => f.ruleId === "OBS-LAMBDA-TIMEOUT");
    expect(timeout).toMatchObject({ status: "confirmed", source: "account", severity: "high" });
    expect(timeout?.evidence.map((e) => e.reference)).toEqual(["E3", "E2", "E1"]);
    expect(timeout?.explanation).toContain("do not show why the work is slow");
  });

  it("confirms a timeout from the maximum duration alone", () => {
    expect(
      run([], [series("duration_max", [100, 2990])]).some((f) => f.ruleId === "OBS-LAMBDA-TIMEOUT"),
    ).toBe(true);
    expect(
      run([], [series("duration_max", [100, 900])]).some((f) => f.ruleId === "OBS-LAMBDA-TIMEOUT"),
    ).toBe(false);
  });

  it("reports memory exhaustion, throttling, and an error rate", () => {
    expect(run([log(REPORT(10, 128))], []).some((f) => f.ruleId === "OBS-LAMBDA-MEMORY")).toBe(
      true,
    );
    expect(
      run([], [series("throttles", [0, 4, 2])]).find((f) => f.ruleId === "OBS-LAMBDA-THROTTLED")
        ?.explanation,
    ).toContain("6 throttled");
    const errors = run(
      [log("ERROR TypeError: x")],
      [series("errors", [5]), series("invocations", [50])],
    ).find((f) => f.ruleId === "OBS-LAMBDA-ERRORS");
    expect(errors?.severity).toBe("high");
    expect(errors?.explanation).toContain("10%");
    expect(errors?.explanation).toContain("TypeError (1)");
    expect(
      run([], [series("errors", [1]), series("invocations", [1000])]).find(
        (f) => f.ruleId === "OBS-LAMBDA-ERRORS",
      )?.severity,
    ).toBe("medium");
  });

  it("says nothing when nothing is wrong, except that tracing is off, and flags a cut sample", () => {
    const quiet = run([log(REPORT(20, 50))], [series("errors", [0]), series("invocations", [10])]);
    expect(quiet.map((f) => f.ruleId)).toEqual(["OBS-NO-TRACING"]);
    const cut = analyze({
      config,
      reading: readLogs([]),
      logEntry: "E3",
      configEntry: "E1",
      metricEntry: "E2",
      metrics: new Map(),
      logsTruncated: true,
    });
    expect(cut.some((f) => f.ruleId === "OBS-LOGS-SAMPLED")).toBe(true);
  });

  it("does not claim a cause: no finding is a hypothesis disguised as a fact", () => {
    for (const finding of run(
      [log("Task timed out after 3.00 seconds"), log(REPORT(20, 50, 100))],
      [series("errors", [3]), series("invocations", [10])],
    )) {
      expect(["confirmed", "informational"]).toContain(finding.status);
      expect(finding.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe("commands", () => {
  it("investigate builds an evidence ledger, makes a bounded number of calls, and reports the cost", async () => {
    const { api, calls } = fake({
      logs: [log(REPORT(2999, 60)), log("Task timed out after 3.00 seconds")],
      metrics: [series("invocations", [10]), series("errors", [2]), series("duration_max", [3000])],
    });
    const result = await runCli(
      ["investigate", "--function", "orders", "--since", "30m"],
      deps(api),
    );
    expect(result.stdout).toContain("Evidence ledger:");
    expect(result.stdout).toContain("E1 [config]");
    expect(result.stdout).toContain("E3 [logs]");
    expect(result.stdout).toContain("OBS-LAMBDA-TIMEOUT");
    expect(result.stdout).toContain("3 billed AWS API call(s)");
    expect(calls).toEqual([
      "getFunction",
      "metrics:6",
      expect.stringMatching(/^filterLogs:\/aws\/lambda\/orders:\?REPORT.*:200:5$/),
      "close",
    ]);
    const parsed = jsonOf(
      (await runCli(["investigate", "--function", "orders", "--json"], deps(api))).stdout,
    );
    expect(parsed["report"]).toMatchObject({
      plugin: "aws-observability",
      mode: "read-only-cloud",
    });
    expect((parsed["ledger"] as unknown[]).length).toBe(3);
  });

  it("status reads the configuration and metrics but not the logs", async () => {
    const { api, calls } = fake({ metrics: [series("invocations", [4]), series("errors", [0])] });
    const result = await runCli(["status", "--function", "orders"], deps(api));
    expect(result.stdout).toContain("4 invocation(s)");
    expect(calls.some((c) => c.startsWith("filterLogs"))).toBe(false);
  });

  it("logs are bounded, redacted, and say when there is more", async () => {
    const { api, calls } = fake({
      logs: [log("ERROR token=abcdef123456 failed")],
      truncated: true,
    });
    const result = await runCli(
      ["logs", "--function", "orders", "--filter", "ERROR", "--limit", "50"],
      deps(api),
    );
    expect(result.stdout).not.toContain("abcdef123456");
    expect(result.stdout).toContain("there is more");
    expect(calls[0]).toBe("filterLogs:/aws/lambda/orders:ERROR:50:5");
    const missing = await runCli(
      ["logs", "--function", "ghost"],
      deps(fake({ missingGroup: true }).api),
    );
    expect(missing.stdout).toContain("There is no log group /aws/lambda/ghost");
  });

  it("metrics return typed series and say that no data is not proof", async () => {
    const { api } = fake({ metrics: [series("errors", [1, 2])] });
    const parsed = jsonOf(
      (await runCli(["metrics", "--function", "orders", "--json"], deps(api))).stdout,
    );
    const list = parsed["series"] as Array<{
      metric: string;
      periodSeconds: number;
      points: unknown[];
    }>;
    expect(list.find((s) => s.metric === "Errors")?.points).toHaveLength(2);
    expect(list[0]?.periodSeconds).toBe(60);
    expect((await runCli(["metrics", "--function", "orders"], deps(api))).stdout).toContain(
      "not proof that nothing ran",
    );
  });

  it("a queue with a non-empty dead-letter queue and an old backlog is reported with evidence", async () => {
    const queues: Record<string, QueueInfo> = {
      orders: {
        name: "orders",
        visible: 120,
        inFlight: 10,
        delayed: 0,
        deadLetterTarget: "arn:aws:sqs:us-east-1:123456789012:orders-dlq",
        maxReceiveCount: 5,
        visibilityTimeoutSeconds: 180,
      },
      "orders-dlq": {
        name: "orders-dlq",
        visible: 7,
        inFlight: 0,
        delayed: 0,
        deadLetterTarget: null,
        maxReceiveCount: null,
        visibilityTimeoutSeconds: 30,
      },
    };
    const { api } = fake({ queues, metrics: [series("age", [60, 900])] });
    const result = await runCli(["status", "--queue", "orders"], deps(api));
    expect(result.stdout).toContain("OBS-DLQ-MESSAGES");
    expect(result.stdout).toContain("OBS-QUEUE-BACKLOG");
    expect(result.stdout).toContain("7 message(s)");
    expect(result.stdout).toContain("in the window");
  });

  it("flags a queue with no dead-letter queue, and reports a missing queue plainly", async () => {
    const queues: Record<string, QueueInfo> = {
      plain: {
        name: "plain",
        visible: 0,
        inFlight: 0,
        delayed: 0,
        deadLetterTarget: null,
        maxReceiveCount: null,
        visibilityTimeoutSeconds: 30,
      },
    };
    expect(
      (await runCli(["status", "--queue", "plain"], deps(fake({ queues }).api))).stdout,
    ).toContain("OBS-NO-DLQ");
    expect(
      (await runCli(["status", "--queue", "ghost"], deps(fake({ queues }).api))).stdout,
    ).toContain("does not exist");
  });

  it("lists alarms with a cap and creates nothing; trace reports only the configuration", async () => {
    const { api, calls } = fake({
      alarms: [
        {
          name: "orders-errors",
          state: "ALARM",
          reason: "Threshold Crossed",
          metric: "Errors",
          updatedAt: null,
        },
      ],
    });
    const result = await runCli(["alarms", "--prefix", "orders", "--state", "ALARM"], deps(api));
    expect(result.stdout).toContain("ALARM");
    expect(result.stdout).toContain("Threshold Crossed");
    expect(calls[0]).toBe("alarms:orders:ALARM:100");
    expect((await runCli(["trace", "--function", "orders"], deps(fake().api))).stdout).toContain(
      "not active",
    );
    expect(
      (
        await runCli(
          ["trace", "--function", "orders"],
          deps(
            fake({
              fn: {
                name: "orders",
                runtime: null,
                timeoutSeconds: 3,
                memoryMb: 128,
                tracing: "Active",
                lastModified: null,
                deadLetterTarget: null,
              },
            }).api,
          ),
        )
      ).stdout,
    ).toContain("does not read them");
  });

  it.each([
    [
      "AccessDeniedException",
      "User x is not authorized to perform: lambda:GetFunctionConfiguration on resource y",
      "Missing permission: lambda:GetFunctionConfiguration",
    ],
    ["ResourceNotFoundException", "Function not found", "does not exist"],
    ["ThrottlingException", "Rate exceeded", "throttled"],
    ["ExpiredToken", "expired", "session expired"],
  ])("reports %s plainly, without the SDK text", async (name, message, expected) => {
    const { api } = fake({ fail: Object.assign(new Error(message), { name }) });
    const result = await runCli(["status", "--function", "orders"], deps(api));
    expect(result.stdout).toContain(expected);
    expect(result.stdout).not.toContain("on resource y");
  });

  it("validates input before calling AWS", async () => {
    const { api, calls } = fake();
    for (const argv of [
      [],
      ["delete"],
      ["status"],
      ["status", "--function", "a", "--queue", "b"],
      ["logs", "--function", "../x"],
      ["logs", "--function", "a", "--since", "3d"],
      ["logs", "--function", "a", "--limit", "201"],
      ["status", "--queue", "https://sqs.example/q"],
      ["logs", "--function", "a", "--bogus"],
      ["logs", "--function", "a", "--filter", "x\u0007"],
      ["alarms", "--state", "BROKEN"],
      ["status", "--function", "a", "--region", "nope"],
    ]) {
      expect((await runCli(argv, deps(api))).exitCode).toBe(2);
    }
    expect(calls).toEqual([]);
    expect(
      (
        await runCli(
          ["status", "--function", "a"],
          deps(api, { sdkRegion: () => Promise.resolve(null) }),
        )
      ).stdout,
    ).toContain("No region is set");
  });
});

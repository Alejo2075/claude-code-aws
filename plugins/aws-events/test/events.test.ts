import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { rules } from "../src/lib/rules.js";
import { nextRuns, parseSchedule } from "../src/lib/schedule.js";

const NOW = new Date("2026-10-31T00:00:00Z");
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-events-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (args: string[]) => runCli(args, { root, now: NOW });
const put = (name: string, value: unknown): void => {
  writeFileSync(join(root, name), JSON.stringify(value));
};
const template = {
  Resources: {
    Bus: { Type: "AWS::Events::EventBus", Properties: { Name: "orders" } },
    Fn: { Type: "AWS::Lambda::Function", Properties: {} },
    BroadRule: {
      Type: "AWS::Events::Rule",
      Properties: {
        EventPattern: { source: ["app.orders"] },
        Targets: [{ Id: "t", Arn: { "Fn::GetAtt": ["Fn", "Arn"] } }],
      },
    },
    GoodRule: {
      Type: "AWS::Events::Rule",
      Properties: {
        EventPattern: { source: ["a"], "detail-type": ["B"] },
        Targets: [
          {
            Id: "t",
            Arn: { "Fn::GetAtt": ["Fn", "Arn"] },
            DeadLetterConfig: { Arn: "arn:x" },
            RetryPolicy: { MaximumRetryAttempts: 0 },
          },
        ],
      },
    },
    Empty: { Type: "AWS::Events::Rule", Properties: { State: "DISABLED" } },
    Nightly: {
      Type: "AWS::Scheduler::Schedule",
      Properties: { ScheduleExpression: "cron(0 2 * * ? *)", Target: { Arn: "arn:x" } },
    },
    Open: { Type: "AWS::Events::EventBusPolicy", Properties: { Principal: "*", StatementId: "s" } },
  },
};

describe("rules over a template", () => {
  it("reports the missing triggers, DLQs, UTC default, broad pattern, and open bus policy", () => {
    const parsed = parseTemplate(template);
    if (!parsed.ok) throw new Error(parsed.error);
    const ids = rules("S", parsed.template).map((f) => f.ruleId);
    for (const id of [
      "EVT-RULE-NO-TRIGGER",
      "EVT-RULE-DISABLED",
      "EVT-PATTERN-BROAD",
      "EVT-TARGET-NO-DLQ",
      "EVT-TARGET-NO-RETRY",
      "EVT-SCHEDULE-UTC-DEFAULT",
      "EVT-SCHEDULE-NO-DLQ",
      "EVT-BUS-POLICY-OPEN",
    ])
      expect(ids, id).toContain(id);
    expect(ids.filter((i) => i === "EVT-TARGET-NO-DLQ")).toHaveLength(1);
  });
});

describe("schedule expressions", () => {
  it("accepts good ones and explains bad ones", () => {
    expect(parseSchedule("rate(5 minutes)").ok).toBe(true);
    expect(parseSchedule("rate(1 hour)").ok).toBe(true);
    expect(parseSchedule("at(2026-12-31T23:59:00)").ok).toBe(true);
    expect(parseSchedule("cron(0 12 * * ? *)").ok).toBe(true);
    for (const bad of [
      "rate(1 hours)",
      "rate(5 minute)",
      "rate(0 days)",
      "cron(0 12 * * *)",
      "cron(0 12 * * * *)",
      "cron(0 12 ? * ? *)",
      "cron(61 12 * * ? *)",
      "cron(0 12 15W * ? *)",
      "every day",
      "at(not-a-date)",
    ])
      expect(parseSchedule(bad).ok, bad).toBe(false);
  });

  it("rate runs are evenly spaced", () => {
    const p = parseSchedule("rate(15 minutes)");
    if (!p.ok) throw new Error(p.error);
    expect(nextRuns(p.value, "UTC", new Date("2026-01-01T00:00:00Z"), 3).map((r) => r.utc)).toEqual(
      ["2026-01-01T00:15:00Z", "2026-01-01T00:30:00Z", "2026-01-01T00:45:00Z"],
    );
  });

  it("a noon cron in New York is 17:00 UTC in winter and 16:00 UTC in summer", () => {
    const p = parseSchedule("cron(0 12 * * ? *)");
    if (!p.ok) throw new Error(p.error);
    expect(nextRuns(p.value, "America/New_York", new Date("2026-01-15T00:00:00Z"), 1)[0]?.utc).toBe(
      "2026-01-15T17:00:00Z",
    );
    expect(nextRuns(p.value, "America/New_York", new Date("2026-07-15T00:00:00Z"), 1)[0]?.utc).toBe(
      "2026-07-15T16:00:00Z",
    );
  });

  it("flags a local time that does not exist on the spring-forward day", () => {
    const p = parseSchedule("cron(30 2 8 3 ? 2026)");
    if (!p.ok) throw new Error(p.error);
    const runs = nextRuns(p.value, "America/New_York", new Date("2026-03-01T00:00:00Z"), 1);
    expect(runs[0]?.utc).toBe("(none)");
    expect(runs[0]?.note).toMatch(/does not exist/);
  });

  it("flags a local time that occurs twice on the fall-back day", () => {
    const p = parseSchedule("cron(30 1 1 11 ? 2026)");
    if (!p.ok) throw new Error(p.error);
    const runs = nextRuns(p.value, "America/New_York", new Date("2026-10-01T00:00:00Z"), 1);
    expect(runs[0]?.utc).toBe("2026-11-01T05:30:00Z");
    expect(runs[0]?.note).toMatch(/twice/);
  });

  it("day-of-week and last-day-of-month", () => {
    const mon = parseSchedule("cron(0 9 ? * MON *)");
    const last = parseSchedule("cron(0 9 L * ? *)");
    if (!mon.ok || !last.ok) throw new Error("parse");
    expect(
      nextRuns(mon.value, "UTC", new Date("2026-11-01T00:00:00Z"), 2).map((r) => r.utc),
    ).toEqual(["2026-11-02T09:00:00Z", "2026-11-09T09:00:00Z"]);
    expect(
      nextRuns(last.value, "UTC", new Date("2026-02-01T00:00:00Z"), 2).map((r) => r.utc),
    ).toEqual(["2026-02-28T09:00:00Z", "2026-03-31T09:00:00Z"]);
  });
});

describe("the command line", () => {
  it("inspects a cdk.out and draws the routing graph", async () => {
    mkdirSync(join(root, "cdk.out"));
    put("cdk.out/S.template.json", template);
    const r = await cli(["inspect"]);
    expect(r.stdout).toContain("EVT-TARGET-NO-DLQ");
    expect(r.stdout).toMatch(/bus\s+S\/Bus/);
    const g = await cli(["graph"]);
    expect(g.stdout).toContain("flowchart");
    expect((await cli(["inspect", "nothing"])).exitCode).toBe(1);
  });

  it("tests a pattern against an event and says why not", async () => {
    put("p.json", { source: ["app.orders"], detail: { total: [{ numeric: [">", 100] }] } });
    put("e.json", { source: "app.orders", detail: { total: 5 } });
    const miss = await cli(["test", "p.json", "e.json"]);
    expect(miss.stdout).toMatch(/NO MATCH/);
    expect(miss.stdout).toMatch(/total/);
    put("e2.json", { source: "app.orders", detail: { total: 500 } });
    expect((await cli(["test", "p.json", "e2.json"])).stdout).toMatch(/^MATCH/);
    put("bad.json", { source: [] });
    expect((await cli(["test", "bad.json", "e.json"])).exitCode).toBe(1);
    expect((await cli(["test", "/etc/passwd", "e.json"])).exitCode).toBe(1);
  });

  it("checks schedules, zones, and counts", async () => {
    const ok = await cli([
      "schedule",
      "cron(0 12 * * ? *)",
      "--tz",
      "America/New_York",
      "--from",
      "2026-07-15T00:00:00Z",
      "--count",
      "2",
    ]);
    expect(ok.stdout).toContain("2026-07-15T16:00:00Z");
    expect((await cli(["schedule", "cron(0 12 * * ? *)", "--tz", "Mars/Base"])).exitCode).toBe(2);
    expect((await cli(["schedule", "rate(1 hours)"])).exitCode).toBe(1);
    expect((await cli(["schedule", "rate(5 minutes)", "--count", "500"])).exitCode).toBe(2);
    expect((await cli(["schedule"])).exitCode).toBe(2);
  });

  it("prints the envelope, rejects unknown commands", async () => {
    expect((await cli(["envelope"])).stdout).toContain("OrderPlaced.v1");
    expect((await cli(["nope"])).exitCode).toBe(2);
    expect((await cli(["inspect", "--bogus"])).exitCode).toBe(2);
    expect((await cli([])).exitCode).toBe(2);
  });
});

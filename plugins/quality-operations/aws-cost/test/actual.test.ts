import { describe, expect, it } from "vitest";

import { budgetFindings, hintFor, summarize } from "../src/lib/actual.js";
import type { ActualApi, BudgetInfo, CostPeriod } from "../src/lib/actual-api.js";
import { runCli } from "../src/lib/cli.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const periods: CostPeriod[] = [
  {
    start: "2026-10-01",
    end: "2026-11-01",
    estimated: false,
    groups: [
      { key: "AWS Lambda", amount: 3 },
      { key: "Amazon DynamoDB", amount: 1 },
      { key: "Tax", amount: 0.5 },
    ],
  },
  {
    start: "2026-11-01",
    end: "2026-11-02",
    estimated: true,
    groups: [{ key: "AWS Lambda", amount: 0.5 }],
  },
];

function fake(over: Partial<ActualApi> = {}): { api: ActualApi; calls: string[] } {
  const calls: string[] = [];
  const api: ActualApi = {
    identity: () =>
      Promise.resolve({ accountId: "111122223333", arn: "arn:aws:iam::111122223333:user/x" }),
    costs: (i) => {
      calls.push(`costs ${i.start} ${i.end} ${i.granularity} ${i.groupBy} max${i.maxRequests}`);
      return Promise.resolve({ periods, requests: 1, truncated: false, unit: "USD" });
    },
    budgets: () => {
      calls.push("budgets");
      return Promise.resolve([]);
    },
    close: () => undefined,
    ...over,
  };
  return { api, calls };
}
const run = (argv: string[], f = fake()) =>
  runCli(argv, { root: "/tmp", actual: { api: () => f.api, known: () => null, now: NOW } });

describe("summaries", () => {
  it("adds periods, ranks groups, and works out shares (hand-checked)", () => {
    const s = summarize(periods, "USD");
    expect(s.total).toBeCloseTo(5, 10); // 3 + 1 + 0.5 + 0.5
    expect(s.groups[0]).toMatchObject({ key: "AWS Lambda", amount: 3.5 });
    expect(s.groups[0]?.share).toBeCloseTo(0.7, 10);
    expect(s.anyEstimated).toBe(true);
    expect(summarize([], "USD").total).toBe(0);
  });
  it("gives a lead for known services and none for others", () => {
    expect(hintFor("AWS Lambda")).toMatch(/arm64/);
    expect(hintFor("Tax")).toMatch(/not an optimization target/);
    expect(hintFor("Amazon Something New")).toBeNull();
  });
  it("flags a missing budget and one near its limit", () => {
    expect(budgetFindings([], NOW).map((f) => f.ruleId)).toEqual(["COST-NO-BUDGET"]);
    const b: BudgetInfo = {
      name: "monthly",
      type: "COST",
      limit: 100,
      unit: "USD",
      timeUnit: "MONTHLY",
      actual: 85,
      forecast: null,
    };
    expect(budgetFindings([b], NOW).map((f) => f.ruleId)).toEqual(["COST-BUDGET-NEAR-LIMIT"]);
    expect(budgetFindings([{ ...b, actual: 10 }], NOW)).toEqual([]);
    expect(budgetFindings([{ ...b, actual: 120 }], NOW)[0]?.severity).toBe("high");
  });
});

describe("analyze", () => {
  it("does not read cost without --approve-cost and says what it would cost", async () => {
    const f = fake();
    const r = await run(["analyze", "--since", "30d"], f);
    expect(r.stdout).toMatch(/NOT RUN/);
    expect(r.stdout).toMatch(/at most about \$0\.02/);
    expect(r.stdout).toContain("1111…3333");
    expect(f.calls).toEqual([]);
  });
  it("reads the announced window with the request limit and labels the result as billed", async () => {
    const f = fake();
    const r = await run(["analyze", "--since", "30d", "--max-requests", "1", "--approve-cost"], f);
    expect(f.calls).toEqual(["costs 2026-10-02 2026-11-01 MONTHLY SERVICE max1"]);
    expect(r.stdout).toMatch(/ACTUAL \(billed/);
    expect(r.stdout).toMatch(/Total 5\.00 USD/);
    expect(r.stdout).toMatch(/about \$0\.01/);
    expect(r.stdout).toMatch(/nothing here is a forecast or a saving/);
  });
  it("optimize adds hypotheses, never savings", async () => {
    const r = await run(["optimize", "--approve-cost", "--json"]);
    const body = JSON.parse(r.stdout) as {
      report: { findings: Array<{ ruleId: string; status: string }> };
    };
    expect(
      body.report.findings.every(
        (x) => x.ruleId === "COST-TOP-DRIVER" && x.status === "hypothesis",
      ),
    ).toBe(true);
    const text = await run(["optimize", "--approve-cost"]);
    expect(text.stdout).toMatch(/NOT verified savings/);
  });
  it("says when the request limit cut the list short", async () => {
    const f = fake({
      costs: () => Promise.resolve({ periods, requests: 2, truncated: true, unit: "USD" }),
    });
    expect((await run(["analyze", "--approve-cost"], f)).stdout).toMatch(/incomplete/);
  });
  it("validates options and refuses when the identity cannot be verified", async () => {
    expect((await run(["analyze", "--since", "0d"])).exitCode).toBe(2);
    expect((await run(["analyze", "--max-requests", "50"])).exitCode).toBe(2);
    expect((await run(["analyze", "--group-by", "nope"])).exitCode).toBe(2);
    expect((await run(["analyze", "--bogus"])).exitCode).toBe(2);
    const f = fake({ identity: () => Promise.reject(new Error("expired")) });
    const r = await run(["analyze", "--approve-cost"], f);
    expect(r.exitCode).toBe(1);
    expect(f.calls).toEqual([]);
  });
});

describe("budgets", () => {
  it("lists budgets without a cost approval because the call is free", async () => {
    const f = fake();
    const r = await run(["budgets"], f);
    expect(f.calls).toEqual(["budgets"]);
    expect(r.stdout).toMatch(/COST-NO-BUDGET/);
  });
  it("is unavailable without an adapter", async () => {
    expect((await runCli(["analyze"], { root: "/tmp" })).exitCode).toBe(2);
  });
});

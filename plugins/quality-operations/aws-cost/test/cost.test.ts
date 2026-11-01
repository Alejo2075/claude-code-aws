import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { costCodec } from "@claude-code-aws/report-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { compareApiKind, compareArch, compareLambdaMemory } from "../src/lib/compare.js";
import { estimateWorkload, sensitivity, validateWorkload } from "../src/lib/estimate.js";
import data from "../src/data/prices.us-east-1.json" with { type: "json" };
import { priceOf, rateDate, tieredCost } from "../src/lib/prices.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-cost-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const NOW = new Date("2026-10-31T00:00:00Z");

describe("the price snapshot", () => {
  it("is dated, sourced, and well formed", () => {
    expect(data.region).toBe("us-east-1");
    expect(data.source).toMatch(/^https:\/\/pricing\.us-east-1\.amazonaws\.com\//);
    expect(data.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const [key, item] of Object.entries(data.prices) as Array<
      [string, ReturnType<typeof priceOf>]
    >) {
      expect(item.publicationDate, key).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.offer, key).not.toBe("");
      expect(item.tiers.length, key).toBeGreaterThan(0);
      expect(item.tiers.at(-1)?.upTo ?? null, `${key} last tier is open`).toBeNull();
      const bounds = item.tiers.slice(0, -1).map((t) => t.upTo ?? Infinity);
      expect(
        [...bounds].sort((a, b) => a - b),
        `${key} tiers ascend`,
      ).toEqual(bounds);
      for (const tier of item.tiers) expect(tier.price).toBeGreaterThanOrEqual(0);
    }
  });

  it("walks tiers the way the price list defines them", () => {
    expect(tieredCost(priceOf("lambda.compute.x86"), 1_000_000).total).toBeCloseTo(16.6667, 4);
    expect(tieredCost(priceOf("lambda.compute.x86"), 7e9).total).toBeCloseTo(
      6e9 * 0.0000166667 + 1e9 * 0.000015,
      0,
    );
    expect(tieredCost(priceOf("apigw.rest"), 400e6).total).toBeCloseTo(
      333e6 * 3.5e-6 + 67e6 * 2.8e-6,
      1,
    );
    expect(tieredCost(priceOf("sns.request"), 3_000_000).total).toBeCloseTo(1, 6);
    expect(tieredCost(priceOf("sns.request"), 500_000).total).toBe(0);
    expect(tieredCost(priceOf("dynamodb.read"), 0).total).toBe(0);
  });

  it("reports the latest publication date among the prices used", () => {
    expect(rateDate(["lambda.request.x86", "apigw.http"])).toBe("2026-10-30");
    expect(rateDate(["dynamodb.read"])).toBe("2026-09-11");
  });
});

describe("estimate", () => {
  const workload = {
    lambda: { requestsPerMonth: 10_000_000, avgDurationMs: 200, memoryMb: 512 },
    apiGateway: { kind: "http" as const, requestsPerMonth: 10_000_000 },
    dynamodb: { readRequestUnitsPerMonth: 20_000_000, writeRequestUnitsPerMonth: 10_000_000 },
  };

  it("matches a hand calculation for an API + Lambda + DynamoDB workload", () => {
    const estimate = estimateWorkload(workload, NOW);
    const byDescription = Object.fromEntries(
      estimate.lines.map((line) => [line.description, line.monthly]),
    );
    expect(estimate.lines.find((l) => l.unit === "GB-second")?.quantity).toBe(1_000_000);
    expect(byDescription["10000000 invocations (10000000 requests)"]).toBe(2);
    expect(byDescription["512 MB for 200 ms on average (x86)"]).toBe(16.67);
    expect(byDescription["HTTP API requests"]).toBe(10);
    expect(byDescription["On-demand read request units"]).toBe(2.5);
    expect(byDescription["On-demand write request units"]).toBe(6.25);
    expect(estimate.totalMonthly).toBe(37.42);
  });

  it("is labeled an estimate, dated, and lists what it leaves out and assumes", () => {
    const estimate = estimateWorkload(workload, NOW);
    expect(estimate).toMatchObject({
      kind: "estimated",
      currency: "USD",
      region: "us-east-1",
      rateDate: "2026-10-30",
    });
    expect(estimate.exclusions.join(" ")).toContain("Free tier");
    expect(estimate.exclusions.join(" ")).toContain("Data transfer");
    expect(estimate.assumptions.length).toBe(3);
    expect(estimate.limitations.join(" ")).toContain("not billed spending");
    expect(costCodec.validate(estimate).ok).toBe(true);
  });

  it("applies the retry rate to invocations and the Graviton prices", () => {
    const retried = estimateWorkload({
      lambda: { requestsPerMonth: 1_000_000, avgDurationMs: 100, memoryMb: 1024, retryRate: 0.5 },
    });
    expect(retried.lines[0]?.quantity).toBe(1_500_000);
    const arm = estimateWorkload({
      lambda: { requestsPerMonth: 1_000_000, avgDurationMs: 100, memoryMb: 1024, arch: "arm" },
    });
    const x86 = estimateWorkload({
      lambda: { requestsPerMonth: 1_000_000, avgDurationMs: 100, memoryMb: 1024 },
    });
    expect(arm.totalMonthly).toBeLessThan(x86.totalMonthly);
  });

  it("prices queues, topics, workflows, and logs", () => {
    const estimate = estimateWorkload({
      sqs: { requestsPerMonth: 30_000_000 },
      sns: { requestsPerMonth: 3_000_000 },
      stepFunctions: { standardTransitionsPerMonth: 1_000_000 },
      logs: { ingestGbPerMonth: 10, storedGb: 20 },
    });
    const total = (service: string): number =>
      estimate.lines.filter((l) => l.service === service).reduce((sum, l) => sum + l.monthly, 0);
    expect(total("SQS")).toBe(12);
    expect(total("SNS")).toBe(1);
    expect(total("Step Functions")).toBe(25);
    expect(total("CloudWatch Logs")).toBeCloseTo(5.6, 2);
  });

  it("scales with volume in the sensitivity table", () => {
    const table = sensitivity(workload);
    expect(table.map((row) => row.factor)).toEqual([0.5, 1, 2, 5, 10]);
    expect(table[1]?.totalMonthly).toBe(37.42);
    for (let i = 1; i < table.length; i += 1)
      expect(table[i]?.totalMonthly).toBeGreaterThan(table[i - 1]?.totalMonthly ?? 0);
  });
});

describe("validateWorkload", () => {
  it("accepts a good workload", () => {
    expect(
      validateWorkload({ lambda: { requestsPerMonth: 1, avgDurationMs: 1, memoryMb: 128 } })
        .problems,
    ).toEqual([]);
  });

  it.each([
    [null],
    [[]],
    [{ unknown: {} }],
    [{ lambda: { requestsPerMonth: -1, avgDurationMs: 1, memoryMb: 128 } }],
    [{ lambda: { requestsPerMonth: 1, avgDurationMs: 1, memoryMb: 64 } }],
    [{ lambda: { requestsPerMonth: 1, avgDurationMs: 1, memoryMb: 128, arch: "mips" } }],
    [{ lambda: { requestsPerMonth: "10", avgDurationMs: 1, memoryMb: 128 } }],
    [{ lambda: { requestsPerMonth: 1, avgDurationMs: 1, memoryMb: 128, retryRate: 50 } }],
    [{ apiGateway: { kind: "graphql", requestsPerMonth: 1 } }],
    [{ sqs: {} }],
    [{ logs: { ingestGbPerMonth: Number.POSITIVE_INFINITY } }],
  ])("rejects %j", (value) => {
    expect(validateWorkload(value).problems.length).toBeGreaterThan(0);
  });
});

describe("comparisons", () => {
  it("compares API types by price and says what the cheaper one lacks", () => {
    const c = compareApiKind(100_000_000);
    expect(c.options.map((o) => o.monthly)).toEqual([100, 350]);
    expect(c.cheapest).toBe("HTTP API");
    expect(c.notes.join(" ")).toContain("usage plans");
  });

  it("compares memory sizes from measured durations, not from guesses", () => {
    const c = compareLambdaMemory(1_000_000, [
      { memoryMb: 128, durationMs: 900 },
      { memoryMb: 256, durationMs: 520 },
      { memoryMb: 512, durationMs: 300 },
    ]);
    expect(c.options.map((o) => o.monthly)).toEqual([2.08, 2.37, 2.7]);
    expect(c.cheapest).toBe("128 MB");
    expect(c.notes.join(" ")).toContain("inputs you measured");
    expect(
      compareLambdaMemory(1_000_000, [
        { memoryMb: 128, durationMs: 1000 },
        { memoryMb: 1024, durationMs: 100 },
      ]).cheapest,
    ).toBe("1024 MB");
  });

  it("compares architectures and warns that the arm duration must be measured", () => {
    const same = compareArch(1_000_000, 512, 200, 200);
    expect(same.cheapest).toBe("Graviton (arm64)");
    expect(compareArch(1_000_000, 512, 200, 400).cheapest).toBe("x86");
    expect(same.notes.join(" ")).toContain("measure it");
  });
});

describe("the command", () => {
  const run = (argv: string[]) => runCli(argv, { root, now: NOW });
  const workload = JSON.stringify({
    lambda: { requestsPerMonth: 10_000_000, avgDurationMs: 200, memoryMb: 512 },
  });

  it("estimates from an inline workload or a file inside the project, with a sensitivity table on request", async () => {
    const inline = await run(["estimate", "--workload", workload]);
    expect(inline.stdout).toContain("ESTIMATED monthly cost: $18.67");
    expect(inline.stdout).toContain("not a billed amount");
    mkdirSync(join(root, "costs"));
    writeFileSync(join(root, "costs", "w.json"), workload);
    const sens = await run(["estimate", "--file", "costs/w.json", "--sensitivity"]);
    expect(sens.stdout).toContain("Sensitivity");
    const parsed = JSON.parse(
      (await run(["estimate", "--workload", workload, "--json"])).stdout,
    ) as { kind: string };
    expect(parsed.kind).toBe("estimated");
  });

  it.each([
    [["estimate"]],
    [["estimate", "--workload", "{ nope"]],
    [["estimate", "--workload", "{}"]],
    [
      [
        "estimate",
        "--workload",
        '{"lambda":{"requestsPerMonth":-1,"avgDurationMs":1,"memoryMb":128}}',
      ],
    ],
    [["estimate", "--file", "../../etc/passwd"]],
    [["estimate", "--file", "missing.json"]],
    [["estimate", "--workload", "x".repeat(21_000)]],
    [["compare"]],
    [["compare", "api-kind"]],
    [["compare", "lambda-memory", "--requests", "10", "--points", "bad"]],
    [["compare", "lambda-memory", "--requests", "10", "--points", "64:100"]],
    [["compare", "lambda-arch", "--requests", "10"]],
    [["compare", "nothing", "--requests", "10"]],
    [["frobnicate"]],
    [["estimate", "--bogus"]],
  ])("rejects %j without estimating", async (argv) => {
    expect((await run(argv)).exitCode).toBe(2);
  });

  it("compares from the command line and lists the price snapshot", async () => {
    expect((await run(["compare", "api-kind", "--requests", "100000000"])).stdout).toContain(
      "<-- cheapest",
    );
    expect(
      (
        await run([
          "compare",
          "lambda-memory",
          "--requests",
          "1000000",
          "--points",
          "128:900,256:520",
        ])
      ).stdout,
    ).toContain("128 MB");
    expect(
      (
        await run([
          "compare",
          "lambda-arch",
          "--requests",
          "1000000",
          "--memory",
          "512",
          "--x86-ms",
          "200",
          "--arm-ms",
          "200",
        ])
      ).stdout,
    ).toContain("Graviton");
    const prices = await run(["prices"]);
    expect(prices.stdout).toContain("us-east-1");
    expect(prices.stdout).toContain("2026-10-31");
  });

  it("states that it makes no AWS calls and offers no verb that changes anything", async () => {
    expect((await run([])).stdout).toContain("makes no AWS calls");
  });
});

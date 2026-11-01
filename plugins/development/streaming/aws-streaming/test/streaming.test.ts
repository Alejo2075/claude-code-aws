import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { rules } from "../src/lib/rules.js";
import {
  distribution,
  lagHypotheses,
  recordCheck,
  shardOf,
  shardsNeeded,
} from "../src/lib/tools.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-stream-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });

describe("rules", () => {
  it("finds consumer and delivery problems", () => {
    const p = parseTemplate({
      Resources: {
        S: { Type: "AWS::Kinesis::Stream", Properties: { ShardCount: 2 } },
        Fn: { Type: "AWS::Lambda::Function", Properties: {} },
        M: {
          Type: "AWS::Lambda::EventSourceMapping",
          Properties: {
            EventSourceArn: { "Fn::GetAtt": ["S", "Arn"] },
            FunctionName: { Ref: "Fn" },
          },
        },
        F: {
          Type: "AWS::KinesisFirehose::DeliveryStream",
          Properties: {
            ExtendedS3DestinationConfiguration: {
              ProcessingConfiguration: { Enabled: true },
              BufferingHints: { SizeInMBs: 500, IntervalInSeconds: 60 },
            },
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const ids = rules("S", p.template).map((f) => f.ruleId);
    for (const id of [
      "STR-NO-ENCRYPTION",
      "STR-ESM-NO-BISECT",
      "STR-ESM-INFINITE-RETRY",
      "STR-ESM-NO-ONFAILURE",
      "STR-FH-NO-ERROR-PREFIX",
      "STR-FH-BUFFER-RANGE",
      "STR-FH-NO-COMPRESSION",
    ])
      expect(ids, id).toContain(id);
  });
  it("accepts a well configured consumer", () => {
    const p = parseTemplate({
      Resources: {
        S: { Type: "AWS::Kinesis::Stream", Properties: { StreamEncryption: {} } },
        M: {
          Type: "AWS::Lambda::EventSourceMapping",
          Properties: {
            EventSourceArn: { "Fn::GetAtt": ["S", "Arn"] },
            BisectBatchOnFunctionError: true,
            MaximumRetryAttempts: 3,
            DestinationConfig: { OnFailure: {} },
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    expect(rules("S", p.template)).toEqual([]);
  });
});

describe("shard math", () => {
  it("takes the largest of write, record, and read needs", () => {
    expect(
      shardsNeeded({
        writeMbPerSec: 3.2,
        recordsPerSec: 500,
        readMbPerSec: 1,
        consumers: 1,
        enhancedFanOut: false,
      }).shards,
    ).toBe(4);
    expect(
      shardsNeeded({
        writeMbPerSec: 0.1,
        recordsPerSec: 5200,
        readMbPerSec: 1,
        consumers: 1,
        enhancedFanOut: false,
      }).shards,
    ).toBe(6);
    // Three shared consumers each reading 2 MB/s of the stream need 3 * 2 / 2 = 3 shards.
    expect(
      shardsNeeded({
        writeMbPerSec: 0.5,
        recordsPerSec: 10,
        readMbPerSec: 2,
        consumers: 3,
        enhancedFanOut: false,
      }).shards,
    ).toBe(3);
    expect(
      shardsNeeded({
        writeMbPerSec: 0.5,
        recordsPerSec: 10,
        readMbPerSec: 2,
        consumers: 3,
        enhancedFanOut: true,
      }).shards,
    ).toBe(1);
    expect(
      shardsNeeded({
        writeMbPerSec: 0,
        recordsPerSec: 0,
        readMbPerSec: 0,
        consumers: 1,
        enhancedFanOut: false,
      }).shards,
    ).toBe(1);
  });
});

describe("partition keys", () => {
  it("places keys deterministically, inside the shard range", () => {
    expect(shardOf("a", 4)).toBe(shardOf("a", 4));
    for (const k of ["a", "b", "order-1", "ü"]) {
      expect(shardOf(k, 4)).toBeGreaterThanOrEqual(0);
      expect(shardOf(k, 4)).toBeLessThan(4);
    }
    // MD5("a") = 0cc175b9..., so its top bits put it in the first quarter.
    expect(shardOf("a", 4)).toBe(0);
  });
  it("warns about one hot key and too few keys", () => {
    const keys = [
      ...Array.from({ length: 80 }, () => "hot"),
      ...Array.from({ length: 20 }, (_, i) => `k${i}`),
    ];
    const d = distribution(keys, 4);
    expect(d.topKey?.key).toBe("hot");
    expect(d.warnings.join(" ")).toMatch(/carries 80%/);
    expect(distribution(["a", "b"], 8).warnings.join(" ")).toMatch(/Only 2 distinct/);
    expect(d.perShard.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("records and lag", () => {
  it("checks the size limit", () => {
    expect(recordCheck(1024 * 1024, 1).ok).toBe(true);
    expect(recordCheck(1024 * 1024 + 1, 1).ok).toBe(false);
    expect(recordCheck(5 * 1024 * 1024, 10).ok).toBe(true);
  });
  it("explains a growing iterator age", () => {
    expect(
      lagHypotheses({
        iteratorAgeMs: 120_000,
        incomingMbPerSec: 0.2,
        shards: 2,
        throttledWrites: 0,
        lambdaErrors: 5,
      }).join(" "),
    ).toMatch(/poison record/);
    expect(
      lagHypotheses({
        iteratorAgeMs: 0,
        incomingMbPerSec: 0.1,
        shards: 2,
        throttledWrites: 4,
        lambdaErrors: 0,
      }).join(" "),
    ).toMatch(/throttled/);
  });
});

describe("the command line", () => {
  it("runs each command and validates input", async () => {
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({
        Resources: { S: { Type: "AWS::Kinesis::Stream", Properties: { ShardCount: 1 } } },
      }),
    );
    expect((await cli(["inspect"])).stdout).toContain("STR-NO-ENCRYPTION");
    expect(
      (await cli(["shards", "--write-mb", "2", "--records", "100", "--read-mb", "2"])).stdout,
    ).toMatch(/At least 2 shard/);
    expect((await cli(["shards"])).exitCode).toBe(2);
    writeFileSync(
      join(root, "keys.json"),
      JSON.stringify(["a", "b", "c", "d", "e", "f", "g", "h"]),
    );
    expect((await cli(["partition-check", "keys.json", "--shards", "2"])).stdout).toMatch(
      /shard 0/,
    );
    writeFileSync(join(root, "bad.json"), '{"a":1}');
    expect((await cli(["partition-check", "bad.json", "--shards", "2"])).exitCode).toBe(1);
    expect((await cli(["record-check", "--bytes", "2000000"])).exitCode).toBe(1);
    expect((await cli(["record-check", "--bytes", "10"])).exitCode).toBe(0);
    expect((await cli(["diagnose", "--iterator-age-ms", "1"])).exitCode).toBe(2);
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

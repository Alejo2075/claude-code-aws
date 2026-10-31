import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { rules } from "../src/lib/rules.js";
import { attributesToValues, checkFifoSend, diagnoseBacklog } from "../src/lib/tools.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-msg-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (args: string[]) => runCli(args, { root, now: new Date("2026-10-31T00:00:00Z") });
const put = (n: string, v: unknown): void => {
  writeFileSync(join(root, n), JSON.stringify(v));
};
const template = {
  Resources: {
    Dlq: { Type: "AWS::SQS::Queue", Properties: { MessageRetentionPeriod: 60 } },
    Work: {
      Type: "AWS::SQS::Queue",
      Properties: {
        VisibilityTimeout: 30,
        MessageRetentionPeriod: 345600,
        RedrivePolicy: {
          maxReceiveCount: 1,
          deadLetterTargetArn: { "Fn::GetAtt": ["Dlq", "Arn"] },
        },
      },
    },
    Lone: { Type: "AWS::SQS::Queue", Properties: { FifoQueue: true, QueueName: "lone" } },
    Fn: { Type: "AWS::Lambda::Function", Properties: { Timeout: 60 } },
    Map: {
      Type: "AWS::Lambda::EventSourceMapping",
      Properties: {
        EventSourceArn: { "Fn::GetAtt": ["Work", "Arn"] },
        FunctionName: { Ref: "Fn" },
        BatchSize: 10,
      },
    },
    Topic: { Type: "AWS::SNS::Topic", Properties: {} },
    Sub: {
      Type: "AWS::SNS::Subscription",
      Properties: {
        Protocol: "sqs",
        TopicArn: { Ref: "Topic" },
        Endpoint: { "Fn::GetAtt": ["Work", "Arn"] },
      },
    },
    Pol: {
      Type: "AWS::SQS::QueuePolicy",
      Properties: {
        PolicyDocument: {
          Statement: [{ Effect: "Allow", Principal: "*", Action: "sqs:SendMessage" }],
        },
      },
    },
  },
};

describe("rules", () => {
  it("finds each queue and topic design problem once", () => {
    const parsed = parseTemplate(template);
    if (!parsed.ok) throw new Error(parsed.error);
    const ids = rules("S", parsed.template).map((f) => f.ruleId);
    for (const id of [
      "MSG-NO-DLQ",
      "MSG-DLQ-RETENTION",
      "MSG-MAXRECEIVE-ONE",
      "MSG-FIFO-NAME",
      "MSG-FIFO-DEDUP-ID",
      "MSG-NO-LONG-POLLING",
      "MSG-VISIBILITY-TOO-LOW",
      "MSG-NO-PARTIAL-BATCH",
      "MSG-TOPIC-NOT-ENCRYPTED",
      "MSG-SUB-NO-DLQ",
      "MSG-QUEUE-POLICY-OPEN",
    ])
      expect(ids, id).toContain(id);
    // The dead-letter queue itself is not asked to have a dead-letter queue.
    expect(
      rules("S", parsed.template)
        .filter((f) => f.ruleId === "MSG-NO-DLQ")
        .map((f) => f.affectedResources?.[0]),
    ).toEqual(["S/Lone"]);
  });
});

describe("SNS attributes and FIFO sends", () => {
  it("converts typed attributes", () => {
    const r = attributesToValues({
      store: { Type: "String", Value: "eu" },
      price: { Type: "Number", Value: "12.5" },
      tags: { Type: "String.Array", Value: '["a","b"]' },
    });
    expect(r).toEqual({ ok: true, value: { store: "eu", price: 12.5, tags: ["a", "b"] } });
    expect(attributesToValues({ x: { Type: "Number", Value: "abc" } }).ok).toBe(false);
    expect(attributesToValues({ x: { Type: "String.Array", Value: "nope" } }).ok).toBe(false);
    expect(attributesToValues([]).ok).toBe(false);
  });
  it("checks group and deduplication ids", () => {
    expect(checkFifoSend({ contentBased: false })).toHaveLength(2);
    expect(checkFifoSend({ groupId: "g", contentBased: true })).toEqual([]);
    expect(
      checkFifoSend({ groupId: "x".repeat(129), dedupId: "d", contentBased: false }),
    ).toHaveLength(1);
    expect(checkFifoSend({ groupId: "bad group", dedupId: "d", contentBased: false })).toHaveLength(
      1,
    );
  });
});

describe("backlog hypotheses", () => {
  const base = {
    visible: 10,
    inFlight: 5,
    oldestAgeSeconds: 30,
    receiveRatePerSec: 10,
    sendRatePerSec: 5,
    visibilitySeconds: 30,
    retentionSeconds: 345600,
    dlqDepth: 0,
  };
  it("flags growth, stuck consumers, retention risk, and a dead-letter queue", () => {
    expect(
      diagnoseBacklog({ ...base, sendRatePerSec: 20 })
        .map((h) => h.statement)
        .join(" "),
    ).toMatch(/faster than they are consumed/);
    expect(
      diagnoseBacklog({ ...base, receiveRatePerSec: 0 })
        .map((h) => h.statement)
        .join(" "),
    ).toMatch(/hold messages but finish none/);
    expect(
      diagnoseBacklog({ ...base, oldestAgeSeconds: 300000 })
        .map((h) => h.statement)
        .join(" "),
    ).toMatch(/retention/);
    expect(
      diagnoseBacklog({ ...base, dlqDepth: 3 })
        .map((h) => h.statement)
        .join(" "),
    ).toMatch(/dead-letter queue/);
    expect(diagnoseBacklog(base)[0]?.statement).toMatch(/Nothing in these numbers/);
  });
});

describe("the command line", () => {
  it("inspects cdk.out", async () => {
    mkdirSync(join(root, "cdk.out"));
    put("cdk.out/S.template.json", template);
    const r = await cli(["inspect"]);
    expect(r.stdout).toContain("MSG-QUEUE-POLICY-OPEN");
    expect(r.stdout).toMatch(/queue\s+S\/Work.*DLQ after 1 receives/);
    expect((await cli(["inspect", "missing"])).exitCode).toBe(1);
  });
  it("filter-test on attributes and on body", async () => {
    put("policy.json", { store: ["eu"], price: [{ numeric: [">", 10] }] });
    put("msg.json", {
      store: { Type: "String", Value: "eu" },
      price: { Type: "Number", Value: "12" },
    });
    expect((await cli(["filter-test", "policy.json", "msg.json"])).stdout).toMatch(/DELIVERED/);
    put("msg2.json", {
      store: { Type: "String", Value: "us" },
      price: { Type: "Number", Value: "12" },
    });
    expect((await cli(["filter-test", "policy.json", "msg2.json"])).stdout).toMatch(
      /FILTERED OUT[\s\S]*store/,
    );
    put("body.json", { detail: { state: "ok" } });
    put("bp.json", { detail: { state: ["ok"] } });
    expect((await cli(["filter-test", "bp.json", "body.json", "--scope", "body"])).stdout).toMatch(
      /DELIVERED/,
    );
    expect(
      (await cli(["filter-test", "policy.json", "msg.json", "--scope", "nope"])).exitCode,
    ).toBe(2);
  });
  it("fifo-check and diagnose validate their inputs", async () => {
    expect((await cli(["fifo-check"])).exitCode).toBe(0);
    expect((await cli(["fifo-check"])).stdout).toMatch(/MessageGroupId is required/);
    expect((await cli(["fifo-check", "--group", "g", "--content-based"])).stdout).toMatch(
      /valid for a FIFO queue/,
    );
    expect((await cli(["diagnose", "--visible", "1"])).exitCode).toBe(2);
    const ok = await cli([
      "diagnose",
      "--visible",
      "10",
      "--in-flight",
      "2",
      "--oldest",
      "30",
      "--send-rate",
      "50",
      "--receive-rate",
      "10",
      "--visibility",
      "30",
      "--retention",
      "345600",
      "--dlq",
      "0",
    ]);
    expect(ok.stdout).toMatch(/Hypotheses/);
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { rules } from "../src/lib/rules.js";
import { budget, chunk, reviewRag, reviewTools, scanPrompt } from "../src/lib/tools.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-ai-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });

describe("rules", () => {
  it("finds agent, knowledge base, and model permission problems", () => {
    const p = parseTemplate({
      Resources: {
        Agent: { Type: "AWS::Bedrock::Agent", Properties: { Instruction: "Help." } },
        Kb: {
          Type: "AWS::Bedrock::KnowledgeBase",
          Properties: { KnowledgeBaseConfiguration: { VectorKnowledgeBaseConfiguration: {} } },
        },
        Ds: { Type: "AWS::Bedrock::DataSource", Properties: {} },
        Role: {
          Type: "AWS::IAM::Role",
          Properties: {
            AssumeRolePolicyDocument: {},
            Policies: [
              {
                PolicyName: "p",
                PolicyDocument: {
                  Statement: [{ Effect: "Allow", Action: "bedrock:InvokeModel", Resource: "*" }],
                },
              },
            ],
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const ids = rules("S", p.template).map((f) => f.ruleId);
    for (const id of [
      "AI-AGENT-NO-GUARDRAIL",
      "AI-AGENT-THIN-INSTRUCTION",
      "AI-AGENT-SESSION-TTL",
      "AI-KB-NO-EMBEDDING-MODEL",
      "AI-DS-DEFAULT-CHUNKING",
      "AI-INVOKE-ANY-MODEL",
    ])
      expect(ids, id).toContain(id);
  });
});

describe("budget", () => {
  it("multiplies tokens by the prices given (hand-checked)", () => {
    // 1,000 requests x 2,000 input tokens at 3 per million = 6.00; x 500 output at 15 per million = 7.50.
    const b = budget({
      requests: 1000,
      inputTokens: 2000,
      outputTokens: 500,
      priceInPerMillion: 3,
      priceOutPerMillion: 15,
    });
    expect(b.inputCost).toBeCloseTo(6, 10);
    expect(b.outputCost).toBeCloseTo(7.5, 10);
    expect(b.total).toBeCloseTo(13.5, 10);
    expect(b.perRequest).toBeCloseTo(0.0135, 10);
    expect(b.notes.join(" ")).toMatch(/agent makes several model calls/);
    expect(
      budget({
        requests: 0,
        inputTokens: 1,
        outputTokens: 1,
        priceInPerMillion: 1,
        priceOutPerMillion: 1,
      }).perRequest,
    ).toBe(0);
  });
});

describe("chunking", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here. `).join("");
  it("covers the whole text, with overlap, and ends on sentence boundaries when it can", () => {
    const c = chunk(text, 50, 10);
    expect(c.length).toBeGreaterThan(3);
    expect(c[0]?.start).toBe(0);
    expect(c[c.length - 1]?.end).toBe(text.length);
    for (let i = 1; i < c.length; i += 1)
      expect((c[i]?.start ?? 0) < (c[i - 1]?.end ?? 0)).toBe(true);
    expect(c.slice(0, -1).every((x) => x.text.endsWith(". ") || x.text.endsWith("."))).toBe(true);
  });
  it("terminates on odd settings", () => {
    expect(chunk("", 50, 10)).toEqual([]);
    expect(chunk("abc", 50, 10)).toHaveLength(1);
    expect(chunk("x".repeat(1000), 20, 1000).length).toBeLessThan(2000);
  });
});

describe("prompt scan and reviews", () => {
  it("counts sensitive values without repeating them", () => {
    const r = scanPrompt("Mail ana@example.com key AKIAIOSFODNN7EXAMPLE password: hunter2hunter2");
    expect(r.safeToSend).toBe(false);
    expect(r.kinds["email address"]).toBe(1);
    expect(r.kinds["AWS access key id"]).toBe(1);
    expect(JSON.stringify(r)).not.toContain("hunter2hunter2");
    expect(JSON.stringify(r)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(scanPrompt("Summarize the attached policy.").safeToSend).toBe(true);
  });
  it("flags unsafe agent tools and weak retrieval settings", () => {
    const t = reviewTools([
      { name: "refund", effect: "external" },
      { name: "note", effect: "write", scope: "own tickets", inputSchema: true, approval: true },
      { name: "search", effect: "read", scope: "kb", inputSchema: true },
    ]);
    expect(t.map((x) => `${x.severity}:${x.message}`).join("\n")).toMatch(
      /high:refund: a external tool runs without human approval/,
    );
    expect(t.some((x) => x.message.startsWith("note"))).toBe(false);
    const r = reviewRag({
      embeddingDimensions: 1024,
      vectorStoreDimensions: 1536,
      chunkTokens: 5000,
      overlapTokens: 3000,
      topK: 50,
    }).join("\n");
    for (const re of [
      /1024 dimensions.*1536/,
      /5000 tokens is unusual/,
      /half the chunk/,
      /50 chunks/,
      /cite/,
      /metadata filters/,
      /Fewer than 20/,
      /reranking/,
    ])
      expect(r).toMatch(re);
    expect(
      reviewRag({
        chunkTokens: 400,
        overlapTokens: 40,
        topK: 5,
        citations: true,
        metadataFilters: true,
        evalDatasetSize: 100,
        reranking: true,
      }),
    ).toEqual([]);
  });
});

describe("the command line", () => {
  it("runs each command without calling a model", async () => {
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({ Resources: { A: { Type: "AWS::Bedrock::Agent", Properties: {} } } }),
    );
    expect((await cli(["inspect"])).stdout).toContain("AI-AGENT-NO-GUARDRAIL");
    expect((await cli(["availability", "--region", "us-east-1"])).stdout).toMatch(
      /list-foundation-models/,
    );
    expect((await cli(["availability", "--region", "nope"])).exitCode).toBe(2);
    expect(
      (
        await cli([
          "budget",
          "--requests",
          "1000",
          "--input-tokens",
          "2000",
          "--output-tokens",
          "500",
          "--price-in",
          "3",
          "--price-out",
          "15",
        ])
      ).stdout,
    ).toMatch(/ESTIMATE: 13\.50/);
    expect((await cli(["budget", "--requests", "1"])).exitCode).toBe(2);
    writeFileSync(join(root, "doc.txt"), "Hello world. ".repeat(500));
    expect((await cli(["chunk", "doc.txt", "--size", "100", "--write"])).stdout).toContain(
      "Created doc.chunks.jsonl",
    );
    expect(readFileSync(join(root, "doc.chunks.jsonl"), "utf8").split("\n")[0]).toContain('"id":0');
    expect((await cli(["chunk", "doc.txt", "--size", "5"])).exitCode).toBe(2);
    writeFileSync(join(root, "p.txt"), "email ana@example.com");
    expect((await cli(["prompt-check", "p.txt"])).exitCode).toBe(1);
    writeFileSync(join(root, "rag.json"), JSON.stringify({ chunkTokens: 400 }));
    expect((await cli(["rag-review", "rag.json"])).stdout).toMatch(/cite/);
    writeFileSync(join(root, "tools.json"), JSON.stringify([{ name: "x", effect: "delete" }]));
    expect((await cli(["agent-review", "tools.json"])).stdout).toMatch(/\[high\]/);
    writeFileSync(join(root, "bad.json"), JSON.stringify([{ name: "x", effect: "fly" }]));
    expect((await cli(["agent-review", "bad.json"])).exitCode).toBe(1);
    expect((await cli(["eval-scaffold", "--name", "support"])).stdout).toMatch(/Draft only/);
    expect((await cli(["eval-scaffold", "--name", "support", "--write"])).stdout).toContain(
      "Created evals/support/dataset.jsonl",
    );
    expect(readFileSync(join(root, "evals/support/run.mjs"), "utf8")).toMatch(
      /callModel is not implemented/,
    );
    expect((await cli(["eval-scaffold", "--name", "Bad Name"])).exitCode).toBe(2);
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

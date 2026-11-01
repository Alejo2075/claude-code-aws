import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { planInvoke, TOPICS } from "../src/lib/invoke.js";
import { rules } from "../src/lib/rules.js";
import { EVENTS, scaffold } from "../src/lib/scaffold.js";

const NOW = new Date("2026-10-31T00:00:00Z");
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-lambda-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: NOW });

describe("rules", () => {
  it("finds configuration and security problems and never prints env values", () => {
    const p = parseTemplate({
      Resources: {
        Old: {
          Type: "AWS::Lambda::Function",
          Properties: {
            Runtime: "nodejs12.x",
            MemorySize: 128,
            Timeout: 60,
            Environment: { Variables: { DB_PASSWORD: "hunter2hunter2", STAGE: "prod" } },
          },
        },
        Big: {
          Type: "AWS::Lambda::Function",
          Properties: {
            Runtime: "nodejs22.x",
            MemorySize: 20000,
            Timeout: 2000,
            Layers: [1, 2, 3, 4, 5, 6],
            Architectures: ["arm64"],
            TracingConfig: { Mode: "Active" },
            DeadLetterConfig: { TargetArn: "x" },
          },
        },
        Url: { Type: "AWS::Lambda::Url", Properties: { AuthType: "NONE" } },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const found = rules("S", p.template, NOW);
    const ids = found.map((f) => f.ruleId);
    for (const id of [
      "LMB-RUNTIME",
      "LMB-SMALL-MEMORY-LONG-TIMEOUT",
      "LMB-SECRET-IN-ENV",
      "LMB-MEMORY-RANGE",
      "LMB-TIMEOUT-RANGE",
      "LMB-LAYERS",
      "LMB-URL-NO-AUTH",
      "LMB-NO-TRACING",
      "LMB-X86",
    ])
      expect(ids, id).toContain(id);
    expect(JSON.stringify(found)).not.toContain("hunter2hunter2");
    expect(
      found.filter((f) => f.ruleId === "LMB-NO-TRACING").map((f) => f.affectedResources?.[0]),
    ).toEqual(["S/Old"]);
  });
});

describe("invoke planning", () => {
  const base = {
    fn: "orders-handler",
    region: "us-east-1",
    payloadFile: "p.json",
    payloadBytes: 100,
    async: false,
  };
  it("prepares a command and a dry run, and says it was not run", () => {
    const plan = planInvoke(base);
    expect(plan.ok).toBe(true);
    expect(plan.command).toContain("--invocation-type RequestResponse");
    expect(plan.dryRunCommand).toContain("--invocation-type DryRun");
    expect(planInvoke({ ...base, async: true, qualifier: "live" }).command).toContain(
      "--qualifier live",
    );
  });
  it("rejects bad names, regions, qualifiers and oversize payloads", () => {
    expect(planInvoke({ ...base, fn: "bad name; rm -rf" }).ok).toBe(false);
    expect(planInvoke({ ...base, region: "mars" }).ok).toBe(false);
    expect(planInvoke({ ...base, qualifier: "a b" }).ok).toBe(false);
    expect(planInvoke({ ...base, payloadBytes: 6 * 1024 * 1024 + 1 }).problems[0]).toMatch(
      /synchronous/,
    );
    expect(planInvoke({ ...base, async: true, payloadBytes: 1024 * 1024 + 1 }).problems[0]).toMatch(
      /asynchronous/,
    );
    expect(
      planInvoke({ ...base, fn: "arn:aws:lambda:us-east-1:123456789012:function:orders" }).ok,
    ).toBe(true);
  });
  it("has verified topics with sources", () => {
    for (const t of Object.values(TOPICS))
      expect(t.source).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
  });
});

describe("generated handlers actually run", () => {
  for (const kind of EVENTS) {
    it(`${kind}: the generated test passes under the Node test runner`, () => {
      const dir = mkdtempSync(join(tmpdir(), "gen-"));
      try {
        for (const f of scaffold("orders-worker", kind).files) {
          mkdirSync(join(dir, "src/handlers"), { recursive: true });
          writeFileSync(join(dir, f.path), f.content);
        }
        const out = execFileSync(
          process.execPath,
          [
            "--experimental-strip-types",
            "--no-warnings",
            "--test",
            join(dir, "src/handlers/orders-worker.test.ts"),
          ],
          { encoding: "utf8", timeout: 60_000 },
        );
        expect(out).toMatch(/pass 2/);
        expect(out).toMatch(/fail 0/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe("the command line", () => {
  it("inspects cdk.out, creates files without overwriting, and explains topics", async () => {
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({
        Resources: {
          F: {
            Type: "AWS::Lambda::Function",
            Properties: {
              Runtime: "nodejs22.x",
              Environment: { Variables: { API_KEY: "abcdefgh12345" } },
            },
          },
        },
      }),
    );
    const i = await cli(["inspect"]);
    expect(i.stdout).toContain("LMB-SECRET-IN-ENV");
    expect(i.stdout).not.toContain("abcdefgh12345");
    expect((await cli(["create", "--name", "w", "--event", "sqs"])).stdout).toContain("Draft only");
    expect((await cli(["create", "--name", "w", "--event", "sqs", "--write"])).stdout).toContain(
      "Created src/handlers/w.ts",
    );
    expect((await cli(["create", "--name", "w", "--event", "sqs", "--write"])).exitCode).toBe(1);
    expect(readFileSync(join(root, "src/handlers/w.event.json"), "utf8")).toContain("Records");
    expect((await cli(["create", "--name", "Bad Name", "--event", "sqs"])).exitCode).toBe(2);
    expect((await cli(["create", "--name", "w", "--event", "nope"])).exitCode).toBe(2);
    expect((await cli(["explain", "memory-cpu"])).stdout).toMatch(/1,769/);
    expect((await cli(["explain", "constructor"])).exitCode).toBe(2);
  });
  it("prepares an invoke command from a payload file and refuses malformed or outside payloads", async () => {
    writeFileSync(join(root, "p.json"), '{"id":"x"}');
    const ok = await cli([
      "invoke",
      "--function",
      "orders",
      "--region",
      "us-east-1",
      "--payload",
      "p.json",
    ]);
    expect(ok.stdout).toMatch(/NOT RUN/);
    writeFileSync(join(root, "bad.json"), "{");
    expect(
      (
        await cli([
          "invoke",
          "--function",
          "orders",
          "--region",
          "us-east-1",
          "--payload",
          "bad.json",
        ])
      ).exitCode,
    ).toBe(1);
    expect(
      (
        await cli([
          "invoke",
          "--function",
          "orders",
          "--region",
          "us-east-1",
          "--payload",
          "/etc/passwd",
        ])
      ).exitCode,
    ).toBe(1);
    expect((await cli(["invoke", "--function", "orders"])).exitCode).toBe(2);
  });
});

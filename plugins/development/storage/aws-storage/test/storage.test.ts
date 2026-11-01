import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { rules } from "../src/lib/rules.js";
import {
  checkKey,
  checkLifecycle,
  LIMITS,
  parseSize,
  planUpload,
  reviewBucketPolicy,
} from "../src/lib/tools.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-store-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });
const MiB = 1024 * 1024;

describe("rules", () => {
  it("finds bucket and EFS problems", () => {
    const p = parseTemplate({
      Resources: {
        B: {
          Type: "AWS::S3::Bucket",
          Properties: {
            CorsConfiguration: { CorsRules: [{ AllowedOrigins: ["*"], AllowedMethods: ["PUT"] }] },
          },
        },
        Pol: {
          Type: "AWS::S3::BucketPolicy",
          Properties: {
            Bucket: { Ref: "B" },
            PolicyDocument: {
              Statement: [{ Effect: "Allow", Principal: "*", Action: "s3:GetObject" }],
            },
          },
        },
        F: { Type: "AWS::EFS::FileSystem", Properties: {} },
        A: { Type: "AWS::EFS::AccessPoint", Properties: {} },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const ids = rules("S", p.template).map((f) => f.ruleId);
    for (const id of [
      "STO-NO-PUBLIC-BLOCK",
      "STO-NO-ABORT-MULTIPART",
      "STO-NO-TLS-ONLY",
      "STO-CORS-WILDCARD-WRITE",
      "STO-POLICY-PUBLIC",
      "STO-EFS-NOT-ENCRYPTED",
      "STO-EFS-NO-BACKUP",
      "STO-EFS-AP-NO-ROOT",
    ])
      expect(ids, id).toContain(id);
  });
  it("passes a hardened bucket", () => {
    const p = parseTemplate({
      Resources: {
        B: {
          Type: "AWS::S3::Bucket",
          Properties: {
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              BlockPublicPolicy: true,
              IgnorePublicAcls: true,
              RestrictPublicBuckets: true,
            },
            LifecycleConfiguration: {
              Rules: [
                { Status: "Enabled", AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } },
              ],
            },
          },
        },
        Pol: {
          Type: "AWS::S3::BucketPolicy",
          Properties: {
            Bucket: { Ref: "B" },
            PolicyDocument: {
              Statement: [
                {
                  Effect: "Deny",
                  Principal: "*",
                  Action: "s3:*",
                  Condition: { Bool: { "aws:SecureTransport": "false" } },
                },
              ],
            },
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    expect(rules("S", p.template)).toEqual([]);
  });
});

describe("upload planning", () => {
  it("parses sizes", () => {
    expect(parseSize("5MiB")).toBe(5 * MiB);
    expect(parseSize("1 GiB")).toBe(1024 * MiB);
    expect(parseSize("100")).toBe(100);
    expect(parseSize("abc")).toBeNull();
  });
  it("uses a single PUT for small files and multipart from 100 MiB", () => {
    expect(planUpload(10 * MiB).method).toBe("single-put");
    const p = planUpload(1024 * MiB);
    expect(p.method).toBe("multipart");
    expect(p.partSizeMiB).toBe(16);
    expect(p.parts).toBe(64);
  });
  it("raises the part size to stay under 10,000 parts, and refuses what cannot fit", () => {
    const big = 200 * 1024 * 1024 * 1024; // 200 GiB needs at least 21 MiB parts
    const p = planUpload(big);
    expect(p.partSizeMiB).toBe(21);
    expect(p.parts).toBeLessThanOrEqual(LIMITS.maxParts);
    expect(planUpload(big, 5).notes[0]).toMatch(/more than 10,000 parts/);
    expect(planUpload(LIMITS.maxObject + 1).method).toBe("too-large");
  });
});

describe("keys, lifecycle, and policies", () => {
  it("rejects traversal and long keys, and warns on separators", () => {
    expect(checkKey("a/../b").some((p) => p.level === "error")).toBe(true);
    expect(checkKey("x".repeat(1025)).some((p) => p.message.includes("1,024"))).toBe(true);
    expect(checkKey("a\\b").some((p) => p.level === "error")).toBe(true);
    expect(checkKey("é".repeat(600)).some((p) => p.level === "error")).toBe(true);
    expect(checkKey("/a//b").map((p) => p.level)).toEqual(["warning", "warning"]);
    expect(checkKey("user-1/9f8e.png").every((p) => p.level === "warning")).toBe(true);
    expect(checkKey("")[0]?.level).toBe("error");
  });
  it("checks lifecycle order and missing cleanup", () => {
    const bad = checkLifecycle({
      Rules: [
        {
          ID: "a",
          Status: "On",
          Transitions: [{ Days: 90 }, { Days: 30 }],
          Expiration: { Days: 20 },
        },
      ],
    });
    expect(bad.join("\n")).toMatch(/Status must be/);
    expect(bad.join("\n")).toMatch(/increasing Days/);
    expect(bad.join("\n")).toMatch(/No rule aborts incomplete/);
    expect(
      checkLifecycle({
        Rules: [
          { Status: "Enabled", Filter: {}, Transitions: [{ Days: 30 }], Expiration: { Days: 90 } },
          {
            Status: "Enabled",
            Filter: {},
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
          },
        ],
      }),
    ).toEqual([]);
    expect(checkLifecycle({})).toHaveLength(1);
  });
  it("reviews a bucket policy", () => {
    const open = reviewBucketPolicy({
      Statement: [{ Effect: "Allow", Principal: "*", Action: "s3:*", Resource: "*" }],
    });
    expect(open.map((f) => f.severity)).toEqual(expect.arrayContaining(["high", "medium", "low"]));
    expect(
      reviewBucketPolicy({
        Statement: [
          {
            Effect: "Deny",
            Principal: "*",
            Action: "s3:*",
            Resource: "arn:x",
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("the command line", () => {
  it("runs each command", async () => {
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({ Resources: { B: { Type: "AWS::S3::Bucket", Properties: {} } } }),
    );
    expect((await cli(["inspect"])).stdout).toContain("STO-NO-PUBLIC-BLOCK");
    expect((await cli(["key-check", "../etc/passwd"])).exitCode).toBe(1);
    expect((await cli(["key-check", "ok/file.txt"])).exitCode).toBe(0);
    expect((await cli(["upload-plan", "--size", "2GiB"])).stdout).toMatch(
      /multipart: 128 part\(s\) of 16 MiB/,
    );
    expect((await cli(["upload-plan"])).exitCode).toBe(2);
    expect((await cli(["upload-plan", "--size", "1GiB", "--part-mib", "2"])).exitCode).toBe(2);
    writeFileSync(join(root, "l.json"), JSON.stringify({ Rules: [] }));
    expect((await cli(["lifecycle", "l.json"])).exitCode).toBe(1);
    writeFileSync(
      join(root, "p.json"),
      JSON.stringify({ Statement: [{ Effect: "Allow", Principal: "*", Action: "s3:GetObject" }] }),
    );
    expect((await cli(["access", "p.json"])).stdout).toMatch(/\[high\]/);
    expect((await cli(["access", "../outside.json"])).exitCode).toBe(1);
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

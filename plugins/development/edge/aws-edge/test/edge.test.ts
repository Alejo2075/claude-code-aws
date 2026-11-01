import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { lintFunction, reviewCachePolicy } from "../src/lib/function.js";
import { rules } from "../src/lib/rules.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-edge-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });

describe("distribution rules", () => {
  it("finds transport, origin access, TLS, logging, and Lambda@Edge problems", () => {
    const p = parseTemplate({
      Resources: {
        Edge: {
          Type: "AWS::Lambda::Function",
          Properties: {
            Architectures: ["arm64"],
            Environment: { Variables: { A: "b" } },
            VpcConfig: {},
            Layers: ["x"],
          },
        },
        Dist: {
          Type: "AWS::CloudFront::Distribution",
          Properties: {
            DistributionConfig: {
              ViewerCertificate: { MinimumProtocolVersion: "TLSv1" },
              Origins: [
                { Id: "s3", S3OriginConfig: {} },
                { Id: "app", CustomOriginConfig: { OriginProtocolPolicy: "http-only" } },
                {
                  Id: "old",
                  S3OriginConfig: { OriginAccessIdentity: "origin-access-identity/cloudfront/X" },
                },
              ],
              DefaultCacheBehavior: {
                ViewerProtocolPolicy: "allow-all",
                LambdaFunctionAssociations: [
                  {
                    EventType: "viewer-request",
                    LambdaFunctionARN: { "Fn::GetAtt": ["Edge", "Arn"] },
                  },
                ],
              },
            },
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const ids = rules("S", p.template).map((f) => f.ruleId);
    for (const id of [
      "EDG-VIEWER-HTTP",
      "EDG-OLD-TLS",
      "EDG-S3-NO-ORIGIN-ACCESS",
      "EDG-S3-LEGACY-OAI",
      "EDG-ORIGIN-HTTP",
      "EDG-NO-WAF",
      "EDG-NO-LOGGING",
      "EDG-EDGE-NOT-VERSION",
      "EDG-EDGE-UNSUPPORTED-FEATURE",
    ])
      expect(ids, id).toContain(id);
  });
  it("lints inline CloudFront Function code", () => {
    const p = parseTemplate({
      Resources: {
        Fn: {
          Type: "AWS::CloudFront::Function",
          Properties: { FunctionCode: "function handler(event){ return fetch('x'); }" },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    expect(rules("S", p.template).map((f) => f.ruleId)).toContain("EDG-FUNCTION-CODE");
  });
});

describe("CloudFront Function lint", () => {
  const messages = (src: string) =>
    lintFunction(src)
      .map((i) => `${i.level}:${i.line} ${i.message}`)
      .join("\n");
  it("accepts a plain handler", () => {
    expect(
      lintFunction(
        "function handler(event) {\n  var request = event.request;\n  request.headers['x-a'] = { value: '1' };\n  return request;\n}",
      ),
    ).toEqual([]);
  });
  it("flags eval, Function, network, timers, environment, file system, and body access, with line numbers", () => {
    const m = messages(
      "function handler(event) {\n  eval('1');\n  new Function('x');\n  fetch('u');\n  setTimeout(f, 1);\n  var k = process.env.K;\n  var b = event.request.body;\n  return event.request;\n}",
    );
    expect(m).toMatch(/error:2 eval/);
    expect(m).toMatch(/error:3 new Function/);
    expect(m).toMatch(/error:4 network/);
    expect(m).toMatch(/error:5 timers/);
    expect(m).toMatch(/error:6 environment/);
    expect(m).toMatch(/error:7 CloudFront Functions cannot access the request body/);
  });
  it("needs a handler that returns, ignores comments, and warns on logging and uppercase headers", () => {
    expect(messages("var x = 1;")).toMatch(/no handler function/);
    expect(messages("function handler(e) { var x = 1; }")).toMatch(/never returns/);
    expect(messages("function handler(e) { // eval('x')\n return e.request; }")).toBe("");
    expect(
      messages("function handler(e) { console.log('x'); return e.request.headers['Host']; }"),
    ).toMatch(/truncated at 10 KB[\s\S]*lowercase/);
  });
});

describe("cache policy review", () => {
  it("flags cache key bloat and inconsistent TTLs", () => {
    const r = reviewCachePolicy({
      CachePolicyConfig: {
        MinTTL: 100,
        DefaultTTL: 50,
        MaxTTL: 60,
        ParametersInCacheKeyAndForwardedToOrigin: {
          CookiesConfig: { CookieBehavior: "all" },
          QueryStringsConfig: { QueryStringBehavior: "all" },
          HeadersConfig: { HeaderBehavior: "whitelist", Headers: ["Authorization", "Host"] },
        },
      },
    })
      .map((x) => x.message)
      .join("\n");
    expect(r).toMatch(/All cookies/);
    expect(r).toMatch(/All query strings/);
    expect(r).toMatch(/Authorization header/);
    expect(r).toMatch(/Host header/);
    expect(r).toMatch(/TTLs are inconsistent/);
    expect(reviewCachePolicy([]).length).toBe(1);
  });
});

describe("the command line", () => {
  it("runs each command", async () => {
    writeFileSync(join(root, "f.js"), "function handler(e){ return e.request; }");
    expect((await cli(["function", "f.js"])).stdout).toMatch(/No restriction violations/);
    writeFileSync(join(root, "bad.js"), "eval('x')");
    expect((await cli(["function", "bad.js"])).exitCode).toBe(1);
    writeFileSync(join(root, "c.json"), JSON.stringify({ MinTTL: 0 }));
    expect((await cli(["cache", "c.json"])).stdout).toMatch(/\[low\]/);
    expect((await cli(["diagnose", "403"])).stdout).toMatch(/origin access control/);
    expect((await cli(["diagnose", "999"])).exitCode).toBe(2);
    expect((await cli(["diagnose", "constructor"])).exitCode).toBe(2);
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({
        Resources: {
          D: {
            Type: "AWS::CloudFront::Distribution",
            Properties: { DistributionConfig: { Origins: [], DefaultCacheBehavior: {} } },
          },
        },
      }),
    );
    expect((await cli(["inspect"])).stdout).toContain("EDG-NO-WAF");
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

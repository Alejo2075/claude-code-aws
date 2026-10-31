import { interpret } from "@claude-code-aws/context-contract";
import { describe, expect, it } from "vitest";

import {
  buildReport,
  costCodec,
  diffCodec,
  executionContext,
  fingerprint,
  LOCAL_CONTEXT,
  makeFinding,
  planCodec,
  renderDiff,
  renderReport,
  reportCodec,
  sortFindings,
  testReportCodec,
  timeSeriesCodec,
} from "../src/index.js";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const snapshot = {
  schemaVersion: 1 as const,
  workspaceId: "65d80d2c48b3d23b",
  profile: "dev",
  region: "us-east-1",
  accountId: "123456789012",
  principalArn: "arn:aws:sts::123456789012:assumed-role/Dev/carol",
  environment: "production" as const,
  verification: "verified" as const,
  verifiedAt: "2026-01-01T11:59:00.000Z",
  staleAfter: "2026-01-01T12:04:00.000Z",
  diagnosticCode: null,
};

const finding = (overrides = {}) =>
  makeFinding({
    ruleId: "SEC-IAM-WILDCARD-ACTION",
    plugin: "aws-security",
    severity: "high",
    status: "confirmed",
    source: "static",
    title: "Wildcard action",
    explanation: "The role allows every action.",
    subject: "AdminRole",
    evidence: [{ type: "template", reference: "AdminRole/Policy" }],
    ...overrides,
  });

describe("execution context", () => {
  it("is derived from aws-context's interpretation, never self-asserted", () => {
    expect(executionContext(interpret(snapshot, NOW))).toEqual({
      accountId: "123456789012",
      region: "us-east-1",
      profile: "dev",
      identityVerified: true,
      environment: "production",
    });
    const later = Date.parse("2026-01-01T13:00:00.000Z");
    expect(executionContext(interpret(snapshot, later)).identityVerified).toBe(false);
    expect(executionContext(interpret(null, NOW))).toMatchObject({
      accountId: null,
      identityVerified: false,
      environment: "unknown",
    });
  });
});

describe("findings", () => {
  it("get a stable id and fingerprint for the same rule and subject", () => {
    expect(finding().fingerprint).toBe(finding().fingerprint);
    expect(finding().fingerprint).not.toBe(finding({ subject: "Other" }).fingerprint);
    expect(finding().id).toMatch(/^SEC-IAM-WILDCARD-ACTION:[0-9a-f]{8}$/);
    expect(fingerprint("a", "b")).not.toBe(fingerprint("ab"));
  });

  it("downgrade a model finding with no evidence to a hypothesis", () => {
    expect(finding({ source: "model", evidence: [] }).status).toBe("hypothesis");
    expect(finding({ source: "model" }).status).toBe("confirmed");
    expect(finding({ source: "static", evidence: [] }).status).toBe("confirmed");
  });

  it("sort by severity, then rule", () => {
    const sorted = sortFindings([
      finding({ severity: "low" }),
      finding({ severity: "critical", subject: "x" }),
      finding(),
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(["critical", "high", "low"]);
  });
});

describe("analysis report", () => {
  const report = buildReport({
    plugin: "aws-security",
    context: executionContext(interpret(snapshot, NOW)),
    mode: "local",
    summary: "1 high finding.",
    findings: [finding()],
    limitations: ["Static analysis only."],
    now: NOW,
  });

  it("round-trips through JSON and validates", () => {
    expect(reportCodec.parse(JSON.stringify(report))).toEqual({ ok: true, value: report });
  });

  it("reads documents from a newer writer that add fields", () => {
    const newer = {
      ...report,
      futureField: { a: 1 },
      findings: [{ ...report.findings[0], extra: true }],
    };
    expect(reportCodec.validate(newer).ok).toBe(true);
  });

  it("rejects an unknown schema version, bad enums, and wrong types", () => {
    const rejected = reportCodec.validate({ ...report, schemaVersion: "2" });
    expect(rejected.ok).toBe(false);
    expect(rejected.ok ? "" : rejected.error).toContain("unsupported schema version");
    expect(reportCodec.validate({ ...report, mode: "yolo" }).ok).toBe(false);
    expect(
      reportCodec.validate({ ...report, findings: [{ ...report.findings[0], severity: "urgent" }] })
        .ok,
    ).toBe(false);
    expect(
      reportCodec.validate({ ...report, context: { ...report.context, identityVerified: "yes" } })
        .ok,
    ).toBe(false);
    expect(reportCodec.validate({ ...report, generatedAt: "not a date" }).ok).toBe(false);
  });

  it("rejects hostile input without throwing", () => {
    for (const text of ["", "{", "null", "[]", '"x"', "1", "x".repeat(5_000_000)]) {
      expect(reportCodec.parse(text).ok).toBe(false);
    }
    expect(
      reportCodec.validate({
        ...report,
        findings: Array.from({ length: 6000 }, () => report.findings[0]),
      }).ok,
    ).toBe(false);
  });

  it("renders a short summary first, then evidence, and flags an unverified identity", () => {
    const text = renderReport(report);
    expect(text.indexOf("1 high finding.")).toBeLessThan(text.indexOf("[HIGH]"));
    expect(text).toContain("account 1234…9012");
    expect(text).toContain("identity verified");
    expect(text).toContain("Evidence: template AdminRole/Policy");
    expect(text).toContain("Static analysis only.");
    expect(
      renderReport({ ...report, context: { ...report.context, identityVerified: false } }),
    ).toContain("identity NOT verified");
    expect(renderReport({ ...report, context: LOCAL_CONTEXT })).toContain(
      "no AWS account involved",
    );
    expect(renderReport({ ...report, findings: [], summary: "Clean." })).toContain("No findings.");
    expect(renderReport({ ...report, suppressed: 2 })).toContain(
      "2 finding(s) hidden by exclusions",
    );
    expect(
      renderReport(
        { ...report, findings: [finding(), finding({ subject: "b" })] },
        { maxFindings: 1 },
      ),
    ).toContain("1 more");
  });
});

describe("other documents", () => {
  const base = { schemaVersion: "1", generatedAt: "2026-01-01T00:00:00.000Z" };

  it("validate a template diff and render it", () => {
    const diff = {
      ...base,
      plugin: "aws-infrastructure",
      context: LOCAL_CONTEXT,
      method: "template",
      baseline: "a",
      candidate: "b",
      changes: [
        {
          logicalId: "T",
          resourceType: "AWS::DynamoDB::Table",
          action: "replace",
          properties: ["TableName"],
          stateful: true,
        },
      ],
      summary: { create: 0, update: 0, replace: 1, possibleReplace: 0, delete: 0, unknown: 0 },
      limitations: ["template only"],
    };
    const parsed = diffCodec.validate(diff);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const text = renderDiff(parsed.value);
      expect(text).toContain("[!] REPLACE T");
      expect(text).toContain("stateful");
      expect(text).toContain("template comparison only");
    }
    expect(
      diffCodec.validate({ ...diff, changes: [{ ...diff.changes[0], action: "explode" }] }).ok,
    ).toBe(false);
  });

  it("validate test reports, cost figures, time series, and architecture plans", () => {
    expect(
      testReportCodec.validate({
        ...base,
        plugin: "aws-testing",
        framework: "vitest",
        command: "vitest",
        passed: 1,
        failed: 0,
        skipped: 0,
        durationMs: 5,
        failures: [],
        truncated: false,
        limitations: [],
      }).ok,
    ).toBe(true);
    expect(
      costCodec.validate({
        ...base,
        plugin: "aws-cost",
        kind: "estimated",
        currency: "USD",
        region: "us-east-1",
        rateDate: "2026-10-01",
        assumptions: [],
        exclusions: [],
        lines: [
          {
            service: "Lambda",
            description: "x",
            quantity: 1,
            unit: "GB-s",
            unitPrice: 0.1,
            monthly: 0.1,
          },
        ],
        totalMonthly: 0.1,
        limitations: [],
      }).ok,
    ).toBe(true);
    expect(costCodec.validate({ ...base, kind: "guess" }).ok).toBe(false);
    expect(
      timeSeriesCodec.validate({
        schemaVersion: "1",
        namespace: "AWS/Lambda",
        metric: "Errors",
        statistic: "Sum",
        unit: "Count",
        periodSeconds: 60,
        start: base.generatedAt,
        end: base.generatedAt,
        dimensions: { FunctionName: "f" },
        points: [{ t: base.generatedAt, v: null }],
      }).ok,
    ).toBe(true);
    expect(
      planCodec.validate({
        ...base,
        title: "x",
        requirements: { traffic: "10 rps" },
        components: [{ id: "a", kind: "lambda", name: "A", purpose: "p" }],
        integrations: [{ from: "a", to: "b", style: "async" }],
        assumptions: [],
        risks: [],
        openQuestions: [],
      }).ok,
    ).toBe(true);
    expect(planCodec.validate({ ...base, title: "x", requirements: { traffic: 10 } }).ok).toBe(
      false,
    );
  });
});

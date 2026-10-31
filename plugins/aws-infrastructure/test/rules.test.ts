import { runRules } from "@claude-code-aws/template-analysis";
import { describe, expect, it } from "vitest";

import { IAC_QUALITY_RULES } from "../src/lib/rules.js";
import { inline, template } from "./helpers.js";

const NOW = new Date("2026-10-31T00:00:00Z");
const hits = (ruleId: string, t = template("orders.v1")) => {
  const rule = IAC_QUALITY_RULES.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) throw new Error(ruleId);
  return rule.check(t, { now: NOW });
};

describe("rule pack", () => {
  it("gives every rule an id, a pack, a rationale, and an official source", () => {
    const ids = IAC_QUALITY_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of IAC_QUALITY_RULES) {
      expect(rule.id).toMatch(/^INFRA-[A-Z0-9-]+$/);
      expect(rule.pack).toBe("iac-quality");
      expect(rule.rationale.length).toBeGreaterThan(20);
      expect(rule.source).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
    }
  });
});

describe("INFRA-SQS-NO-DLQ", () => {
  it("passes a queue with a DLQ and does not flag the DLQ itself", () => {
    expect(hits("INFRA-SQS-NO-DLQ")).toEqual([]);
  });
  it("flags a plain queue", () => {
    expect(hits("INFRA-SQS-NO-DLQ", template("flawed.v1")).map((hit) => hit.logicalId)).toEqual([
      expect.stringMatching(/^Plain/),
    ]);
  });
});

describe("INFRA-SQS-VISIBILITY-TIMEOUT", () => {
  it("passes a queue whose visibility timeout is six times the function timeout", () => {
    expect(hits("INFRA-SQS-VISIBILITY-TIMEOUT")).toEqual([]);
    expect(
      hits("INFRA-SQS-VISIBILITY-TIMEOUT", template("scaffold.queue-lambda-dynamodb")),
    ).toEqual([]);
  });
  it("flags the S3 ingest fixture (60s visibility, 30s function)", () => {
    const [hit] = hits("INFRA-SQS-VISIBILITY-TIMEOUT", template("s3-ingest.v1"));
    expect(hit?.explanation).toContain("visibility timeout of 60s");
    expect(hit?.explanation).toContain("needs at least 180s");
    expect(hit?.affected).toHaveLength(2);
  });
  it("uses the defaults when properties are absent", () => {
    const t = inline({
      Q: { Type: "AWS::SQS::Queue", Properties: {} },
      F: { Type: "AWS::Lambda::Function", Properties: { Timeout: 10 } },
      M: {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: { EventSourceArn: { "Fn::GetAtt": ["Q", "Arn"] }, FunctionName: { Ref: "F" } },
      },
    });
    expect(hits("INFRA-SQS-VISIBILITY-TIMEOUT", t)[0]?.explanation).toContain(
      "visibility timeout of 30s",
    );
  });
});

describe("INFRA-LAMBDA-DEFAULT-TIMEOUT", () => {
  it("passes functions with a timeout and flags those without", () => {
    expect(hits("INFRA-LAMBDA-DEFAULT-TIMEOUT")).toEqual([]);
    expect(hits("INFRA-LAMBDA-DEFAULT-TIMEOUT", template("flawed.v1"))).toHaveLength(1);
  });
});

describe("INFRA-LAMBDA-RUNTIME-SUPPORT", () => {
  it("passes nodejs22.x and flags nodejs16.x as deprecated", () => {
    expect(hits("INFRA-LAMBDA-RUNTIME-SUPPORT")).toEqual([]);
    const [hit] = hits("INFRA-LAMBDA-RUNTIME-SUPPORT", template("flawed.v1"));
    expect(hit?.explanation).toContain("nodejs16.x");
    expect(hit?.explanation).toContain("deprecated since 2024-06-12");
  });
  it("warns about a runtime that is about to be deprecated, and about previews", () => {
    const t = (runtime: string) =>
      inline({ F: { Type: "AWS::Lambda::Function", Properties: { Runtime: runtime } } });
    expect(hits("INFRA-LAMBDA-RUNTIME-SUPPORT", t("dotnet8"))[0]?.explanation).toContain(
      "deprecated on 2026-11-10",
    );
    expect(hits("INFRA-LAMBDA-RUNTIME-SUPPORT", t("nodejs26.x"))[0]?.explanation).toContain(
      "preview",
    );
    expect(hits("INFRA-LAMBDA-RUNTIME-SUPPORT", t("some-custom"))).toEqual([]);
  });
});

describe("INFRA-LOG-RETENTION", () => {
  it("passes a function whose log group has a retention period", () => {
    expect(hits("INFRA-LOG-RETENTION")).toEqual([]);
  });
  it("flags functions without one, but not the helper function CDK adds for S3 notifications", () => {
    const flagged = hits("INFRA-LOG-RETENTION", template("s3-ingest.v1"));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.logicalId).toMatch(/^Ingest/);
  });
});

describe("INFRA-STATEFUL-DESTROY", () => {
  it("passes retained tables and buckets", () => {
    expect(hits("INFRA-STATEFUL-DESTROY")).toEqual([]);
    expect(
      hits("INFRA-STATEFUL-DESTROY", template("s3-ingest.v1")).map((hit) => hit.logicalId),
    ).toEqual([]);
  });
  it("flags tables and buckets deleted with the stack", () => {
    const flagged = hits("INFRA-STATEFUL-DESTROY", template("flawed.v1")).map(
      (hit) => hit.logicalId ?? "",
    );
    expect(flagged.some((id) => id.startsWith("Disposable"))).toBe(true);
    expect(flagged.some((id) => id.startsWith("Public"))).toBe(true);
  });
});

describe("INFRA-DDB-NO-PITR", () => {
  it("passes a table with point-in-time recovery", () => {
    expect(hits("INFRA-DDB-NO-PITR")).toEqual([]);
  });
  it("flags one without", () => {
    expect(hits("INFRA-DDB-NO-PITR", template("flawed.v1"))).toHaveLength(1);
  });
});

describe("INFRA-LAMBDA-NO-TRACING and INFRA-NO-ALARMS", () => {
  it("passes a traced function and flags an untraced one", () => {
    expect(hits("INFRA-LAMBDA-NO-TRACING")).toEqual([]);
    expect(
      hits("INFRA-LAMBDA-NO-TRACING", template("s3-ingest.v1")).map((hit) => hit.logicalId),
    ).toEqual([expect.stringMatching(/^Ingest/)]);
  });
  it("flags a stack without alarms once, and passes one with an alarm or with nothing to watch", () => {
    expect(hits("INFRA-NO-ALARMS")).toHaveLength(1);
    expect(
      hits("INFRA-NO-ALARMS", inline({ T: { Type: "AWS::DynamoDB::Table", Properties: {} } })),
    ).toEqual([]);
    expect(
      hits(
        "INFRA-NO-ALARMS",
        inline({
          F: { Type: "AWS::Lambda::Function", Properties: {} },
          A: { Type: "AWS::CloudWatch::Alarm", Properties: {} },
        }),
      ),
    ).toEqual([]);
  });
});

describe("the secure scaffolds", () => {
  it.each(["queue-lambda-dynamodb", "http-api-cognito", "s3-sqs-lambda"])(
    "%s synthesizes to a template with no medium or high finding",
    (name) => {
      const { findings } = runRules(
        "aws-infrastructure",
        IAC_QUALITY_RULES,
        [{ name, template: template(`scaffold.${name}`) }],
        { now: NOW },
      );
      expect(
        findings.filter(
          (finding) =>
            finding.severity === "high" ||
            finding.severity === "medium" ||
            finding.severity === "critical",
        ),
      ).toEqual([]);
    },
  );
});

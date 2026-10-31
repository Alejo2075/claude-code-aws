import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildGraph,
  dependenciesOf,
  dependentsOf,
  diffTemplates,
  findCycles,
  iamStatements,
  isWildcardPrincipal,
  inventory,
  isRetained,
  parseTemplate,
  referencesIn,
  replacementProperties,
  resourcesOfType,
  REPLACEMENT_DATA_DATE,
  RUNTIME_TABLE_DATE,
  RUNTIME_TABLE_SOURCE,
  runtimeStatus,
  runRules,
  summarizeChanges,
  type ResourceInfo,
  type Rule,
  type Template,
} from "../src/index.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "serverless",
  "templates",
);
function load(name: string): Template {
  const parsed = parseTemplate(readFileSync(join(fixtures, `${name}.template.json`), "utf8"));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.template;
}

describe("parseTemplate", () => {
  it("reads a real synthesized template", () => {
    const orders = load("orders.v1");
    expect(Object.keys(orders.resources).length).toBeGreaterThanOrEqual(8);
    expect(resourcesOfType(orders, "AWS::DynamoDB::Table")).toHaveLength(1);
  });

  it.each([
    ["not json"],
    ["[]"],
    ["{}"],
    ['{"Resources":{"A":{}}}'],
    ['{"Resources":{"A":{"Type":5}}}'],
    ['"x"'],
  ])("rejects %s without throwing", (text) => {
    expect(parseTemplate(text).ok).toBe(false);
  });

  it("rejects YAML clearly and oversized input", () => {
    const yaml = parseTemplate("Resources:\n  A:\n    Type: AWS::SQS::Queue");
    expect(yaml.ok).toBe(false);
    expect(yaml.ok ? "" : yaml.error).toContain("YAML");
    expect(parseTemplate("x".repeat(9 * 1024 * 1024))).toMatchObject({ ok: false });
  });
});

describe("graph", () => {
  it("finds references through Ref, GetAtt, Sub, and DependsOn, and ignores pseudo parameters", () => {
    const refs = referencesIn({
      A: { Ref: "Queue" },
      B: { "Fn::GetAtt": ["Table", "Arn"] },
      C: { "Fn::GetAtt": "Fn.Arn" },
      D: {
        "Fn::Sub": ["arn:${AWS::Partition}:x:${Role.Arn}:${Local}", { Local: { Ref: "Other" } }],
      },
      E: { Ref: "AWS::Region" },
    });
    expect(refs.map(([id]) => id).sort()).toEqual(["Fn", "Other", "Queue", "Role", "Table"]);
  });

  it("builds the queue -> function -> table flow of the orders fixture", () => {
    const orders = load("orders.v1");
    const edges = buildGraph(orders);
    const mapping = resourcesOfType(orders, "AWS::Lambda::EventSourceMapping")[0]?.logicalId ?? "";
    const queue =
      resourcesOfType(orders, "AWS::SQS::Queue").find(
        (q) => q.properties["RedrivePolicy"] !== undefined,
      )?.logicalId ?? "";
    const fn = resourcesOfType(orders, "AWS::Lambda::Function")[0]?.logicalId ?? "";
    expect(dependenciesOf(edges, mapping)).toEqual(expect.arrayContaining([queue, fn]));
    expect(dependentsOf(edges, queue)).toContain(mapping);
    expect(findCycles(orders, edges)).toEqual([]);
  });

  it("reports a cycle", () => {
    const parsed = parseTemplate({
      Resources: {
        A: { Type: "X::Y::Z", Properties: { P: { Ref: "B" } } },
        B: { Type: "X::Y::Z", Properties: { P: { Ref: "A" } } },
      },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(findCycles(parsed.template, buildGraph(parsed.template))).toHaveLength(1);
  });
});

describe("inventory", () => {
  it("summarizes the orders fixture", () => {
    const summary = inventory(load("orders.v1"));
    expect(summary.stateful.map((s) => s.type).sort()).toEqual(
      expect.arrayContaining(["AWS::DynamoDB::Table", "AWS::SQS::Queue"]),
    );
    const fn = summary.functions[0];
    expect(fn).toMatchObject({ timeout: 30, memory: 256, tracing: "Active" });
    expect(summary.byType[0]?.count).toBeGreaterThan(0);
  });
});

describe("diffTemplates", () => {
  it("is empty for identical templates", () => {
    expect(diffTemplates(load("orders.v1"), load("orders.v1"))).toEqual([]);
  });

  it("sees a renamed table as a delete plus a create, and says the table is stateful", () => {
    const changes = diffTemplates(load("orders.v1"), load("orders.v2-renamed-table"));
    const deleted = changes.find(
      (change) => change.action === "delete" && change.resourceType === "AWS::DynamoDB::Table",
    );
    const created = changes.find(
      (change) => change.action === "create" && change.resourceType === "AWS::DynamoDB::Table",
    );
    expect(deleted).toMatchObject({ stateful: true, retained: true });
    expect(deleted?.note).toContain("Possible rename");
    expect(deleted?.note).toContain("Retain policy keeps the physical resource");
    expect(created?.note).toContain("Possible rename");
  });

  it("flags a key change as a possible replacement, not a certain one", () => {
    const changes = diffTemplates(load("orders.v1"), load("orders.v3-new-key"));
    const table = changes.find((change) => change.resourceType === "AWS::DynamoDB::Table");
    expect(table).toMatchObject({ action: "possible-replace", stateful: true });
    expect(table?.properties).toEqual(expect.arrayContaining(["KeySchema"]));
    expect(table?.note).toContain("change set");
  });

  it("reports create-only property changes as a replacement", () => {
    const before = parseTemplate({
      Resources: {
        Q: {
          Type: "AWS::SQS::Queue",
          Properties: { QueueName: "a" },
          UpdateReplacePolicy: "Delete",
        },
      },
    });
    const after = parseTemplate({
      Resources: {
        Q: {
          Type: "AWS::SQS::Queue",
          Properties: { QueueName: "b" },
          UpdateReplacePolicy: "Delete",
        },
      },
    });
    if (!before.ok || !after.ok) throw new Error("parse");
    const [change] = diffTemplates(before.template, after.template);
    expect(change).toMatchObject({
      action: "replace",
      properties: ["QueueName"],
      stateful: true,
      retained: false,
    });
    expect(change?.note).toContain("can lose that data");
  });

  it("treats other property changes as updates and unknown types as unknown", () => {
    const before = parseTemplate({
      Resources: {
        F: { Type: "AWS::Lambda::Function", Properties: { Timeout: 3 } },
        C: { Type: "Custom::Thing", Properties: { A: 1 } },
        Z: { Type: "Vendor::Odd::Thing", Properties: { A: 1 } },
      },
    });
    const after = parseTemplate({
      Resources: {
        F: { Type: "AWS::Lambda::Function", Properties: { Timeout: 9 } },
        C: { Type: "Custom::Thing", Properties: { A: 2 } },
        Z: { Type: "Vendor::Odd::Thing", Properties: { A: 2 } },
      },
    });
    if (!before.ok || !after.ok) throw new Error("parse");
    const byId = Object.fromEntries(
      diffTemplates(before.template, after.template).map((change) => [
        change.logicalId,
        change.action,
      ]),
    );
    expect(byId).toEqual({ F: "update", C: "unknown", Z: "unknown" });
  });

  it("notices a changed deletion policy", () => {
    const before = parseTemplate({
      Resources: { T: { Type: "AWS::DynamoDB::Table", Properties: {}, DeletionPolicy: "Retain" } },
    });
    const after = parseTemplate({
      Resources: { T: { Type: "AWS::DynamoDB::Table", Properties: {}, DeletionPolicy: "Delete" } },
    });
    if (!before.ok || !after.ok) throw new Error("parse");
    const [change] = diffTemplates(before.template, after.template);
    expect(change?.properties).toEqual(["DeletionPolicy"]);
    expect(isRetained(before.template.resources["T"] as ResourceInfo)).toBe(true);
  });

  it("summarizes by action", () => {
    expect(
      summarizeChanges(diffTemplates(load("orders.v1"), load("orders.v2-renamed-table"))),
    ).toMatchObject({ replace: 0 });
  });
});

describe("catalog", () => {
  it("carries a dated, sourced replacement table", () => {
    expect(REPLACEMENT_DATA_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(replacementProperties("AWS::DynamoDB::Table")).toContain("TableName");
    expect(replacementProperties("AWS::Nope::Nope")).toBeNull();
  });
});

describe("iamStatements", () => {
  it("finds identity, trust, and resource statements in the flawed fixture", () => {
    const statements = iamStatements(load("flawed.v1"));
    expect(
      statements.some(
        (s) => s.kind === "identity" && s.actions.includes("*") && s.resources.includes("*"),
      ),
    ).toBe(true);
    expect(
      statements.some(
        (s) => s.kind === "trust" && s.principals.includes("Service:lambda.amazonaws.com"),
      ),
    ).toBe(true);
    expect(
      statements.some(
        (s) =>
          s.kind === "resource" &&
          s.principals.some(isWildcardPrincipal) &&
          s.ownerType === "AWS::S3::BucketPolicy",
      ),
    ).toBe(true);
    expect(statements.every((s) => s.path.startsWith("Resources/"))).toBe(true);
  });

  it("shows a public Deny (enforceSSL) as a Deny, not as an open Allow", () => {
    const wildcard = iamStatements(load("s3-ingest.v1")).filter((s) =>
      s.principals.some(isWildcardPrincipal),
    );
    expect(wildcard.length).toBeGreaterThan(0);
    expect(wildcard.every((s) => s.effect === "Deny" && s.hasCondition)).toBe(true);
  });
});

describe("runRules", () => {
  const rule: Rule = {
    id: "TEST-NO-QUEUES",
    pack: "test",
    severity: "low",
    title: "A queue exists",
    rationale: "Queues are suspicious in tests.",
    source: "https://example.com/doc",
    check: (template) =>
      resourcesOfType(template, "AWS::SQS::Queue").map((q) => ({
        logicalId: q.logicalId,
        explanation: `${q.logicalId} is a queue.`,
      })),
  };

  it("turns hits into static, confirmed findings with a template and a doc reference", () => {
    const { findings, suppressed } = runRules(
      "aws-test",
      [rule],
      [{ name: "orders.json", template: load("orders.v1") }],
    );
    expect(suppressed).toBe(0);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      plugin: "aws-test",
      ruleId: "TEST-NO-QUEUES",
      status: "confirmed",
      source: "static",
    });
    expect(findings[0]?.evidence.map((e) => e.type)).toEqual(["template", "doc"]);
    expect(findings[0]?.evidence[0]?.reference).toMatch(/^orders\.json#\/Resources\/Orders/);
    expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(2);
  });

  it("hides excluded findings but counts them", () => {
    const orders = load("orders.v1");
    const id = resourcesOfType(orders, "AWS::SQS::Queue")[0]?.logicalId ?? "";
    const result = runRules("aws-test", [rule], [{ name: "o", template: orders }], {
      exclusions: [{ ruleId: "TEST-NO-QUEUES", logicalId: id }],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.suppressed).toBe(1);
    expect(
      runRules("aws-test", [rule], [{ name: "o", template: orders }], {
        exclusions: [{ ruleId: "TEST-NO-QUEUES", logicalId: "*" }],
      }).findings,
    ).toEqual([]);
  });
});

describe("runtimeStatus", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  it("classifies runtimes against the dated table", () => {
    expect(runtimeStatus("nodejs22.x", now).state).toBe("supported");
    expect(runtimeStatus("nodejs20.x", now)).toEqual({
      state: "deprecated",
      deprecationDate: "2026-04-30",
    });
    expect(runtimeStatus("nodejs16.x", now).state).toBe("deprecated");
    expect(runtimeStatus("python3.10", now).state).toBe("deprecated");
    expect(runtimeStatus("dotnet8", now)).toEqual({
      state: "approaching",
      deprecationDate: "2026-11-10",
    });
    expect(runtimeStatus("nodejs26.x", now)).toEqual({ state: "preview", deprecationDate: null });
    expect(runtimeStatus("cobol1.0", now)).toEqual({ state: "unknown", deprecationDate: null });
  });
  it("is sourced and dated", () => {
    expect(RUNTIME_TABLE_SOURCE).toContain("lambda-runtimes");
    expect(RUNTIME_TABLE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

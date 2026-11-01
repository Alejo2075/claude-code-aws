import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import {
  analyze,
  migrationPlan,
  type ModelInput,
  parseModel,
  queryCost,
} from "../src/lib/model.js";
import { rules } from "../src/lib/rules.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-db-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });

const model: ModelInput = {
  table: { pk: "customerId", sk: "orderId" },
  indexes: [{ name: "ByStatus", pk: "status", sk: "createdAt" }],
  patterns: [
    { id: "ordersOfCustomer", equals: ["customerId"] },
    { id: "oneOrder", equals: ["customerId", "orderId"] },
    { id: "openByDate", equals: ["status"], range: "createdAt" },
    { id: "byEmail", equals: ["email"] },
    { id: "everything", equals: [] },
    { id: "customerFiltered", equals: ["customerId", "total"] },
  ],
};

describe("key design", () => {
  it("serves patterns from the table and indexes and finds the ones that need a scan", () => {
    const r = analyze(model);
    const via = Object.fromEntries(r.served.map((s) => [s.id, s.via]));
    expect(via).toMatchObject({
      ordersOfCustomer: "table",
      oneOrder: "table",
      openByDate: "ByStatus",
      customerFiltered: "table",
    });
    expect(r.served.find((s) => s.id === "customerFiltered")?.note).toMatch(
      /filter runs after the read/,
    );
    expect(r.scans.map((s) => s.id).sort()).toEqual(["byEmail", "everything"]);
    expect(r.suggestions).toEqual([
      { forPattern: "byEmail", index: { name: "GSI2", pk: "email" } },
    ]);
  });
  it("warns about low-cardinality keys and the index limit", () => {
    const hot = analyze({
      ...model,
      patterns: [{ id: "p", equals: ["customerId"], cardinality: "low" }],
    });
    expect(hot.warnings.join(" ")).toMatch(/hot partition/);
    const many = analyze({
      table: { pk: "a" },
      indexes: [],
      patterns: Array.from({ length: 22 }, (_, i) => ({ id: `p${i}`, equals: [`attr${i}`] })),
    });
    expect(many.warnings.join(" ")).toMatch(/22 global secondary indexes/);
  });
  it("rejects malformed models", () => {
    expect(parseModel(null).ok).toBe(false);
    expect(parseModel({ table: {}, patterns: [] }).ok).toBe(false);
    expect(parseModel({ table: { pk: "a" }, patterns: [] }).ok).toBe(false);
    expect(parseModel({ table: { pk: "a" }, patterns: [{ id: 1, equals: [] }] }).ok).toBe(false);
  });
});

describe("read cost", () => {
  it("rounds to 4 KB and halves eventually consistent reads", () => {
    expect(queryCost(10, 1, true, false).rcu).toBe(3); // 10 KB -> 3 x 4 KB
    expect(queryCost(10, 1, false, false).rcu).toBe(1.5);
    expect(queryCost(10, 1, true, true).rcu).toBe(1.5);
    expect(queryCost(10, 1, true, true).note.join(" ")).toMatch(
      /not available on a global secondary index/,
    );
  });
  it("paginates above 1 MB", () => {
    expect(queryCost(5000, 1, false, false).pages).toBe(5);
    expect(queryCost(1, 1, false, false).pages).toBe(1);
  });
});

describe("migration planning", () => {
  it("a table key change needs a new table; an index key change needs a new index", () => {
    const after: ModelInput = {
      table: { pk: "orderId" },
      indexes: [
        { name: "ByStatus", pk: "status", sk: "updatedAt" },
        { name: "ByEmail", pk: "email" },
      ],
      patterns: model.patterns,
    };
    const p = migrationPlan(model, after);
    expect(p.changes.join(" ")).toMatch(/cannot be altered/);
    expect(p.steps.map((s) => s.step).join(" ")).toMatch(/dual write/);
    expect(p.steps.map((s) => s.step).join(" ")).toMatch(/ByStatus-v2/);
    expect(p.steps.map((s) => s.step).join(" ")).toMatch(/Add index ByEmail/);
    expect(migrationPlan(model, model).changes).toEqual(["No key or index change."]);
    expect(migrationPlan(model, { ...model, indexes: [] }).changes.join(" ")).toMatch(
      /ByStatus is removed/,
    );
  });
});

describe("template rules", () => {
  it("finds table and cluster problems", () => {
    const p = parseTemplate({
      Resources: {
        T: {
          Type: "AWS::DynamoDB::Table",
          Properties: {
            KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
            AttributeDefinitions: [{ AttributeName: "id" }, { AttributeName: "extra" }],
            GlobalSecondaryIndexes: [
              {
                IndexName: "G",
                KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
                Projection: { ProjectionType: "ALL" },
              },
            ],
          },
        },
        C: {
          Type: "AWS::RDS::DBCluster",
          Properties: { Engine: "aurora-postgresql", MasterUserPassword: "hunter2hunter2" },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const found = rules("S", p.template);
    const ids = found.map((f) => f.ruleId);
    for (const id of [
      "DB-NO-PITR",
      "DB-NO-DELETION-PROTECTION",
      "DB-NO-RETAIN",
      "DB-UNUSED-ATTRIBUTE-DEFINITION",
      "DB-GSI-PROJECT-ALL",
      "DB-AURORA-NOT-ENCRYPTED",
      "DB-AURORA-NO-DELETION-PROTECTION",
      "DB-AURORA-LITERAL-PASSWORD",
      "DB-AURORA-SHORT-BACKUP",
    ])
      expect(ids, id).toContain(id);
    expect(JSON.stringify(found)).not.toContain("hunter2hunter2");
  });
});

describe("the command line", () => {
  it("runs each command", async () => {
    writeFileSync(join(root, "m.json"), JSON.stringify(model));
    expect((await cli(["model", "m.json"])).stdout).toMatch(
      /3 of 6 pattern\(s\)|4 of 6 pattern\(s\)/,
    );
    expect((await cli(["query", "--items", "100", "--item-kb", "2"])).stdout).toMatch(
      /read capacity unit/,
    );
    expect((await cli(["query"])).exitCode).toBe(2);
    writeFileSync(join(root, "n.json"), JSON.stringify({ ...model, table: { pk: "orderId" } }));
    expect((await cli(["migrate-plan", "m.json", "n.json"])).stdout).toMatch(/PLAN ONLY/);
    writeFileSync(join(root, "bad.json"), "{}");
    expect((await cli(["model", "bad.json"])).exitCode).toBe(1);
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({
        Resources: {
          T: {
            Type: "AWS::DynamoDB::Table",
            Properties: {
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [{ AttributeName: "id" }],
            },
          },
        },
      }),
    );
    expect((await cli(["inspect"])).stdout).toContain("DB-NO-PITR");
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

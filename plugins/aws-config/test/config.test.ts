import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { validateFlags } from "../src/lib/flags.js";
import { rules } from "../src/lib/rules.js";
import { rolloutPlan, validateAgainst } from "../src/lib/schema.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-cfg-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });
const msgs = (doc: unknown) =>
  validateFlags(doc)
    .map((i) => `${i.level}:${i.path} ${i.message}`)
    .join("\n");

const good = {
  version: "1",
  flags: {
    checkout: {
      name: "checkout",
      attributes: {
        limit: { constraints: { type: "number", minimum: 1, maximum: 100, required: true } },
        mode: { constraints: { type: "string", enum: ["a", "b"] } },
      },
    },
  },
  values: { checkout: { enabled: true, limit: 10, mode: "a" } },
};

describe("feature flags", () => {
  it("accepts a good document", () => {
    expect(validateFlags(good)).toEqual([]);
  });
  it("finds bad names, values outside constraints, missing required attributes, and orphans", () => {
    const bad = JSON.parse(JSON.stringify(good)) as {
      flags: Record<string, unknown>;
      values: Record<string, unknown>;
    };
    bad.flags["Bad Name"] = {};
    bad.values["checkout"] = { enabled: "yes", limit: 500, mode: "z", extra: 1 };
    bad.values["ghost"] = { enabled: true };
    const m = msgs(bad);
    expect(m).toMatch(/Bad Name name must start/);
    expect(m).toMatch(/enabled must be true or false/);
    expect(m).toMatch(/limit is above the maximum 100/);
    expect(m).toMatch(/mode must be one of/);
    expect(m).toMatch(/extra has no attribute definition/);
    expect(m).toMatch(/ghost has a value but no flag definition/);
    expect(m).toMatch(/\$\.flags\.Bad Name/);
  });
  it("requires version, rejects stray top-level keys, pattern with enum, bad regex", () => {
    expect(msgs({})).toMatch(/version is required/);
    expect(msgs({ version: "1", other: 1 })).toMatch(/not allowed at the top level/);
    expect(
      msgs({
        version: "1",
        flags: {
          f: { attributes: { a: { constraints: { type: "string", pattern: "x", enum: ["x"] } } } },
        },
      }),
    ).toMatch(/both pattern and enum/);
    expect(
      msgs({
        version: "1",
        flags: { f: { attributes: { a: { constraints: { type: "string", pattern: "(" } } } } },
      }),
    ).toMatch(/not a valid regular expression/);
    expect(msgs({ version: "1", flags: { f: {} } })).toMatch(/has no value/);
  });
  it("checks pattern constraints and array elements on values", () => {
    const doc = {
      version: "1",
      flags: {
        f: {
          attributes: {
            code: { constraints: { type: "string", pattern: "^[A-Z]{3}$" } },
            ids: { constraints: { type: "array", elements: { type: "number", minimum: 0 } } },
          },
        },
      },
      values: { f: { enabled: true, code: "abc", ids: [1, -1] } },
    };
    const m = msgs(doc);
    expect(m).toMatch(/code does not match/);
    expect(m).toMatch(/ids\[1\] is below the minimum 0/);
  });
});

describe("schema subset", () => {
  const schema = {
    type: "object",
    required: ["timeoutMs"],
    additionalProperties: false,
    properties: {
      timeoutMs: { type: "integer", minimum: 100, maximum: 60000 },
      name: { type: "string", minLength: 2, pattern: "^[a-z]+$" },
      tags: { type: "array", items: { type: "string" }, maxItems: 2 },
    },
  };
  it("accepts and rejects", () => {
    expect(validateAgainst({ timeoutMs: 500, name: "ab", tags: ["x"] }, schema)).toEqual([]);
    const errs = validateAgainst(
      { timeoutMs: 5, name: "A", tags: ["a", 1, "c"], extra: 1 },
      schema,
    ).join("\n");
    expect(errs).toMatch(/timeoutMs: 5 is below the minimum 100/);
    expect(errs).toMatch(/name: shorter than 2/);
    expect(errs).toMatch(/name: does not match/);
    expect(errs).toMatch(/tags: more than 2 items/);
    expect(errs).toMatch(/tags\[1\]: expected string/);
    expect(errs).toMatch(/extra: is not allowed/);
    expect(validateAgainst({}, schema)).toEqual(["$.timeoutMs: is required"]);
    expect(validateAgainst("x", schema)).toEqual(["$: expected object, got string"]);
  });
});

describe("rollout plans", () => {
  it("matches the documented linear example (20% growth over 10 hours)", () => {
    const p = rolloutPlan("linear", 20, 600, 0);
    expect(p.steps.map((s) => [s.minute, s.percent])).toEqual([
      [120, 20],
      [240, 40],
      [360, 60],
      [480, 80],
      [600, 100],
    ]);
  });
  it("exponential growth doubles the share and caps at 100", () => {
    const p = rolloutPlan("exponential", 2, 60, 15);
    expect(p.steps.map((s) => s.percent)).toEqual([2, 4, 8, 16, 32, 64, 100]);
    expect(p.bakeUntilMinute).toBe(75);
    expect(p.notes.join(" ")).toMatch(/assumption/);
  });
});

describe("rules", () => {
  it("finds unsafe configuration resources and never prints parameter values", () => {
    const p = parseTemplate({
      Resources: {
        Env: { Type: "AWS::AppConfig::Environment", Properties: {} },
        Strat: {
          Type: "AWS::AppConfig::DeploymentStrategy",
          Properties: { GrowthFactor: 100, DeploymentDurationInMinutes: 0 },
        },
        Prof: { Type: "AWS::AppConfig::ConfigurationProfile", Properties: {} },
        Param: {
          Type: "AWS::SSM::Parameter",
          Properties: { Name: "/app/db_password", Type: "String", Value: "hunter2hunter2" },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const found = rules("S", p.template);
    const ids = found.map((f) => f.ruleId);
    for (const id of [
      "CFG-ENV-NO-MONITORS",
      "CFG-STRATEGY-ALL-AT-ONCE",
      "CFG-STRATEGY-NO-BAKE",
      "CFG-PROFILE-NO-VALIDATOR",
      "CFG-PARAMETER-LOOKS-SECRET",
    ])
      expect(ids, id).toContain(id);
    expect(JSON.stringify(found)).not.toContain("hunter2hunter2");
  });
});

describe("the command line", () => {
  it("runs each command", async () => {
    writeFileSync(join(root, "f.json"), JSON.stringify(good));
    expect((await cli(["flags", "f.json"])).stdout).toMatch(/^Valid/);
    writeFileSync(
      join(root, "bad.json"),
      JSON.stringify({ version: "1", flags: { f: {} }, values: { g: {} } }),
    );
    expect((await cli(["flags", "bad.json"])).exitCode).toBe(1);
    writeFileSync(join(root, "c.json"), JSON.stringify({ timeoutMs: 5 }));
    writeFileSync(
      join(root, "s.json"),
      JSON.stringify({
        type: "object",
        properties: { timeoutMs: { type: "integer", minimum: 100 } },
      }),
    );
    expect((await cli(["validate", "c.json", "--schema", "s.json"])).exitCode).toBe(1);
    expect((await cli(["validate", "c.json"])).exitCode).toBe(2);
    expect(
      (
        await cli([
          "rollout-plan",
          "--type",
          "linear",
          "--growth",
          "50",
          "--minutes",
          "30",
          "--bake",
          "10",
        ])
      ).stdout,
    ).toMatch(/PLAN ONLY[\s\S]*100%/);
    expect((await cli(["rollout-plan", "--growth", "0", "--minutes", "5"])).exitCode).toBe(2);
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({
        Resources: {
          P: {
            Type: "AWS::SSM::Parameter",
            Properties: { Name: "/a/api_key", Type: "String", Value: "abcdef123456" },
          },
        },
      }),
    );
    const r = await cli(["inspect"]);
    expect(r.stdout).toContain("CFG-PARAMETER-LOOKS-SECRET");
    expect(r.stdout).not.toContain("abcdef123456");
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

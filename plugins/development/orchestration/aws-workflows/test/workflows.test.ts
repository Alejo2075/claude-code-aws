import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { definitionOf, validateAsl } from "../src/lib/asl.js";
import { runCli } from "../src/lib/cli.js";
import { summarizeHistory } from "../src/lib/history.js";
import { evalChoice, getPath, simulate } from "../src/lib/sim.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-wf-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });
const put = (n: string, v: unknown): void => {
  writeFileSync(join(root, n), JSON.stringify(v));
};
const messages = (def: unknown, opts = {}) =>
  validateAsl(def, opts)
    .map((i) => `${i.level}:${i.path} ${i.message}`)
    .join("\n");

const good = {
  StartAt: "Validate",
  States: {
    Validate: {
      Type: "Task",
      Resource: "arn:aws:states:::lambda:invoke",
      TimeoutSeconds: 30,
      Retry: [
        { ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 },
      ],
      Catch: [{ ErrorEquals: ["States.ALL"], Next: "Failed" }],
      Next: "Route",
    },
    Route: {
      Type: "Choice",
      Choices: [{ Variable: "$.ok", BooleanEquals: true, Next: "Done" }],
      Default: "Failed",
    },
    Done: { Type: "Succeed" },
    Failed: { Type: "Fail", Error: "Rejected" },
  },
};

describe("ASL validation", () => {
  it("accepts a well formed machine", () => {
    expect(validateAsl(good)).toEqual([]);
  });
  it("finds missing and dangling states, bad types, and a missing terminal", () => {
    expect(messages({ StartAt: "Nope", States: { A: { Type: "Pass", End: true } } })).toMatch(
      /StartAt.*"Nope"/,
    );
    expect(messages({ StartAt: "A", States: { A: { Type: "Pass", Next: "Ghost" } } })).toMatch(
      /"Ghost"/,
    );
    expect(messages({ StartAt: "A", States: { A: { Type: "Bogus" } } })).toMatch(
      /Type must be one of/,
    );
    expect(
      messages({
        StartAt: "A",
        States: { A: { Type: "Pass", Next: "B" }, B: { Type: "Pass", Next: "A" } },
      }),
    ).toMatch(/no terminal state/);
    expect(messages({ StartAt: "A", States: { A: { Type: "Pass" } } })).toMatch(
      /neither Next nor End/,
    );
    expect(
      messages({
        StartAt: "A",
        States: { A: { Type: "Pass", Next: "B", End: true }, B: { Type: "Succeed" } },
      }),
    ).toMatch(/both Next and End/);
  });
  it("checks Choice, Wait, Task, Parallel, Map", () => {
    expect(messages({ StartAt: "C", States: { C: { Type: "Choice", Choices: [] } } })).toMatch(
      /non-empty list/,
    );
    expect(messages({ StartAt: "W", States: { W: { Type: "Wait", End: true } } })).toMatch(
      /Wait states need/,
    );
    expect(messages({ StartAt: "T", States: { T: { Type: "Task", End: true } } })).toMatch(
      /need a Resource/,
    );
    expect(
      messages({ StartAt: "P", States: { P: { Type: "Parallel", End: true, Branches: [] } } }),
    ).toMatch(/Branches/);
    expect(messages({ StartAt: "M", States: { M: { Type: "Map", End: true } } })).toMatch(
      /ItemProcessor/,
    );
    expect(
      messages({
        StartAt: "M",
        States: {
          M: {
            Type: "Map",
            End: true,
            ItemProcessor: { StartAt: "x", States: { x: { Type: "Pass", End: true } } },
          },
        },
      }),
    ).toMatch(/MaxConcurrency/);
  });
  it("checks retry and catch fields, and States.ALL placement", () => {
    expect(
      messages({
        StartAt: "T",
        States: {
          T: {
            Type: "Task",
            Resource: "r",
            TimeoutSeconds: 5,
            End: true,
            Retry: [{ ErrorEquals: ["States.ALL"] }, { ErrorEquals: ["X"] }],
          },
        },
      }),
    ).toMatch(/States\.ALL must be alone/);
    expect(
      messages({
        StartAt: "T",
        States: {
          T: {
            Type: "Task",
            Resource: "r",
            TimeoutSeconds: 5,
            End: true,
            Retry: [{ ErrorEquals: ["X"], BackoffRate: 0.5 }],
          },
        },
      }),
    ).toMatch(/BackoffRate.*1\.0 or more/);
    expect(
      messages({
        StartAt: "T",
        States: {
          T: {
            Type: "Task",
            Resource: "r",
            TimeoutSeconds: 5,
            End: true,
            Retry: [{ ErrorEquals: ["X"], MaxAttempts: 25, BackoffRate: 2 }],
          },
        },
      }),
    ).toMatch(/retry storm/);
    expect(
      messages({
        StartAt: "T",
        States: {
          T: {
            Type: "Task",
            Resource: "r",
            TimeoutSeconds: 5,
            End: true,
            Catch: [{ ErrorEquals: ["X"] }],
          },
        },
      }),
    ).toMatch(/must name a state/);
  });
  it("warns about unreachable states and loops with no exit", () => {
    expect(
      messages({ StartAt: "A", States: { A: { Type: "Succeed" }, Orphan: { Type: "Succeed" } } }),
    ).toMatch(/warning:\$\.States\.Orphan cannot be reached/);
    expect(
      messages({
        StartAt: "A",
        States: {
          A: { Type: "Pass", Next: "B" },
          B: { Type: "Pass", Next: "A" },
          C: { Type: "Succeed" },
        },
      }),
    ).toMatch(/no Choice to leave/);
  });
  it("keeps JSONata and JSONPath fields apart", () => {
    expect(
      messages({
        QueryLanguage: "JSONata",
        StartAt: "P",
        States: { P: { Type: "Pass", End: true, Parameters: {} } },
      }),
    ).toMatch(/JSONPath field/);
    expect(
      messages({
        StartAt: "P",
        States: { P: { Type: "Pass", End: true, Output: "{% $states.input %}" } },
      }),
    ).toMatch(/JSONata field/);
  });
  it("rejects .sync and callback patterns in Express workflows", () => {
    const def = {
      StartAt: "T",
      States: {
        T: {
          Type: "Task",
          Resource: "arn:aws:states:::ecs:runTask.sync",
          TimeoutSeconds: 5,
          End: true,
        },
      },
    };
    expect(messages(def, { type: "EXPRESS" })).toMatch(/Express workflows do not support/);
    expect(messages(def, { type: "STANDARD" })).not.toMatch(/Express/);
  });
});

describe("reading definitions from CloudFormation", () => {
  it("joins CDK's DefinitionString and fills references with placeholders", () => {
    const def = definitionOf({
      DefinitionString: {
        "Fn::Join": [
          "",
          [
            '{"StartAt":"T","States":{"T":{"Type":"Task","Resource":"',
            { "Fn::GetAtt": ["Fn", "Arn"] },
            '","End":true,"TimeoutSeconds":5}}}',
          ],
        ],
      },
    });
    expect(def).toMatchObject({ StartAt: "T" });
    expect(definitionOf({ DefinitionString: "not json" })).toBeNull();
  });
});

describe("logical simulation", () => {
  it("follows a Choice, applies a mocked Task result, and reaches Succeed or Fail", () => {
    const ok = simulate(good, { id: 1 }, { Validate: { ok: true } });
    expect(ok.status).toBe("succeeded");
    expect(ok.steps.map((s) => s.state)).toEqual(["Validate", "Route", "Done"]);
    const no = simulate(good, { id: 1 }, { Validate: { ok: false } });
    expect(no.status).toBe("failed");
  });
  it("stops, rather than guessing, when a Task has no mock or the state type is unsupported", () => {
    expect(simulate(good, {}, {}).reason).toMatch(/needs a mock/);
    const par = simulate(
      { StartAt: "P", States: { P: { Type: "Parallel", End: true, Branches: [] } } },
      {},
      {},
    );
    expect(par.status).toBe("stopped");
  });
  it("detects a loop by step count and a NoChoiceMatched", () => {
    expect(
      simulate({ StartAt: "A", States: { A: { Type: "Pass", Next: "A" } } }, {}, {}, 5).reason,
    ).toMatch(/after 5 steps/);
    expect(
      simulate(
        {
          StartAt: "C",
          States: {
            C: { Type: "Choice", Choices: [{ Variable: "$.x", StringEquals: "a", Next: "S" }] },
            S: { Type: "Succeed" },
          },
        },
        { x: "b" },
        {},
      ).reason,
    ).toBe("States.NoChoiceMatched");
  });
  it("evaluates comparisons, And/Or/Not, and IsPresent", () => {
    const input = { n: 5, s: "a" };
    expect(evalChoice({ Variable: "$.n", NumericGreaterThan: 3 }, input)).toBe(true);
    expect(
      evalChoice(
        {
          And: [
            { Variable: "$.n", NumericLessThan: 10 },
            { Not: { Variable: "$.s", StringEquals: "b" } },
          ],
        },
        input,
      ),
    ).toBe(true);
    expect(
      evalChoice(
        {
          Or: [
            { Variable: "$.n", NumericEquals: 1 },
            { Variable: "$.s", StringEquals: "z" },
          ],
        },
        input,
      ),
    ).toBe(false);
    expect(evalChoice({ Variable: "$.missing", IsPresent: false }, input)).toBe(true);
    expect(evalChoice({ Variable: "$.s", NumericEquals: 1 }, input)).toBe(false);
    expect(getPath({ a: { b: 2 } }, "$.a.b")).toEqual({ found: true, value: 2 });
    expect(getPath({}, "$..x").found).toBe(false);
  });
});

describe("execution history", () => {
  it("names the state that failed and redacts the cause", () => {
    const s = summarizeHistory({
      events: [
        { type: "ExecutionStarted", timestamp: "t0" },
        { type: "TaskStateEntered", timestamp: "t1", stateEnteredEventDetails: { name: "Charge" } },
        {
          type: "TaskFailed",
          timestamp: "t2",
          taskFailedEventDetails: { error: "Boom", cause: "token=abc12345 failed" },
        },
        {
          type: "ExecutionFailed",
          timestamp: "t3",
          executionFailedEventDetails: { error: "Boom", cause: "x" },
        },
      ],
    });
    expect(s?.status).toBe("failed");
    expect(s?.failures[0]?.state).toBe("Charge");
    expect(JSON.stringify(s)).not.toContain("abc12345");
    expect(summarizeHistory({ nope: 1 })).toBeNull();
  });
});

describe("the command line", () => {
  it("validates, inspects, draws, simulates, and summarizes", async () => {
    put("good.json", good);
    expect((await cli(["validate", "good.json"])).stdout).toMatch(/^Valid/);
    put("bad.json", { StartAt: "x", States: {} });
    expect((await cli(["validate", "bad.json"])).exitCode).toBe(1);
    expect((await cli(["validate", "good.json", "--type", "X"])).exitCode).toBe(2);
    expect((await cli(["graph", "good.json"])).stdout).toContain("flowchart");
    put("in.json", { id: 1 });
    put("mock.json", { ok: true });
    expect(
      (await cli(["simulate", "good.json", "--input", "in.json", "--mock", "Validate=mock.json"]))
        .stdout,
    ).toMatch(/LOGICAL SIMULATION[\s\S]*succeeded/);
    expect((await cli(["simulate", "good.json", "--input", "in.json"])).stdout).toMatch(
      /needs a mock/,
    );
    put("h.json", { events: [{ type: "ExecutionSucceeded", timestamp: "t" }] });
    expect((await cli(["debug", "--history", "h.json"])).stdout).toMatch(/succeeded/);
    expect((await cli(["debug"])).exitCode).toBe(2);
    mkdirSync(join(root, "cdk.out"));
    put("cdk.out/S.template.json", {
      Resources: {
        Sm: {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: { StateMachineType: "EXPRESS", DefinitionString: JSON.stringify(good) },
        },
      },
    });
    const r = await cli(["inspect"]);
    expect(r.stdout).toContain("WFL-NO-LOGGING");
    expect(r.stdout).toMatch(/Sm \(EXPRESS\)/);
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});

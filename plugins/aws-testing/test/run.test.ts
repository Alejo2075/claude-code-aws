import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { RunOptions, RunResult } from "@claude-code-aws/tool-runner";
import { afterEach, describe, expect, it } from "vitest";

import { readCoverage, renderCoverage } from "../src/lib/coverage.js";
import { detectFramework, parseJestJson, parseTap, planRun, runTests } from "../src/lib/runner.js";
import { tempProject } from "./helpers.js";

const created: string[] = [];
const project = (files: Record<string, string>): string => {
  const root = tempProject(files);
  created.push(root);
  return root;
};
afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});

const result = (extra: Partial<RunResult> = {}): RunResult => ({
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
  timedOut: false,
  durationMs: 1200,
  spawnError: null,
  ...extra,
});

describe("detectFramework and planRun", () => {
  it("reads package.json", () => {
    expect(detectFramework(project({}))).toBe("vitest");
    const jest = project({});
    writeFileSync(join(jest, "package.json"), JSON.stringify({ devDependencies: { jest: "^30" } }));
    expect(detectFramework(jest)).toBe("jest");
    writeFileSync(join(jest, "package.json"), JSON.stringify({ name: "x" }));
    expect(detectFramework(jest)).toBe("node:test");
    expect(detectFramework(join(jest, "missing"))).toBeNull();
  });

  it("runs the framework's own JavaScript entry with node, related files when asked, and no shell", () => {
    const root = project({});
    const plan = planRun({
      root,
      framework: "vitest",
      related: ["src/a.ts"],
      coverage: true,
      scratch: root,
    });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.command).toBe(process.execPath);
    expect(plan.args).toEqual(
      expect.arrayContaining([
        "related",
        "src/a.ts",
        "--run",
        "--reporter=json",
        "--coverage",
        "--passWithNoTests",
      ]),
    );
    expect(plan.display).toBe("vitest related");
    expect(planRun({ root, framework: "jest", scratch: root })).toHaveProperty("error");
  });
});

describe("report parsers", () => {
  const sample = JSON.stringify({
    numPassedTests: 3,
    numFailedTests: 1,
    numPendingTests: 1,
    testResults: [
      {
        name: "/p/a.test.ts",
        assertionResults: [
          { status: "passed", fullName: "ok" },
          {
            status: "failed",
            fullName: "suite adds",
            failureMessages: [
              "AssertionError: expected 2 to be 3\n    at /p/a.test.ts:4:5\nAWS_SECRET_ACCESS_KEY=hunter2hunter2",
            ],
          },
        ],
      },
      { name: "/p/broken.test.ts", message: "SyntaxError: bad", assertionResults: [] },
    ],
  });

  it("reads a Jest-compatible report, ties failures to files, and redacts", () => {
    const parsed = parseJestJson(sample);
    expect(parsed).toMatchObject({ passed: 3, failed: 1, skipped: 1 });
    expect(parsed?.failures[0]).toMatchObject({ name: "suite adds", file: "/p/a.test.ts" });
    expect(parsed?.failures[0]?.message).toContain("expected 2 to be 3");
    expect(JSON.stringify(parsed)).not.toContain("hunter2hunter2");
    expect(parsed?.failures[1]).toMatchObject({
      name: "(test file failed to run)",
      file: "/p/broken.test.ts",
    });
    expect(parseJestJson("nope")).toBeNull();
  });

  it("reads node:test TAP summaries", () => {
    const tap =
      "TAP version 13\nok 1 - fine\nnot ok 2 - broken thing\n# tests 2\n# pass 1\n# fail 1\n# skipped 0\n";
    expect(parseTap(tap)).toMatchObject({
      passed: 1,
      failed: 1,
      failures: [{ name: "broken thing" }],
    });
    expect(parseTap("no summary")).toBeNull();
  });
});

describe("runTests with a fake runner", () => {
  it("gives the tests no AWS access: scrubbed environment, a private home, dummy credentials", async () => {
    const root = project({});
    let seen: RunOptions | null = null;
    const outcome = await runTests({
      root,
      env: {
        PATH: process.env["PATH"],
        HOME: "/real/home",
        AWS_PROFILE: "prod",
        AWS_ACCESS_KEY_ID: "AKIAREAL",
        AWS_SECRET_ACCESS_KEY: "real",
        GITHUB_TOKEN: "t",
      },
      run: (options) => {
        seen = options;
        const file =
          options.args
            .find((arg) => arg.startsWith("--outputFile="))
            ?.slice("--outputFile=".length) ?? "";
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(
          file,
          JSON.stringify({ numPassedTests: 2, numFailedTests: 0, testResults: [] }),
        );
        return Promise.resolve(result());
      },
    });
    expect(outcome.ok).toBe(true);
    const env = (seen as RunOptions | null)?.env ?? {};
    expect(env["AWS_PROFILE"]).toBeUndefined();
    expect(env["AWS_ACCESS_KEY_ID"]).toBe("test");
    expect(env["AWS_SECRET_ACCESS_KEY"]).toBe("test");
    expect(env["HOME"]).not.toBe("/real/home");
    expect(env["GITHUB_TOKEN"]).toBeUndefined();
    expect(env["NODE_ENV"]).toBe("test");
    if (outcome.ok) {
      expect(outcome.report.limitations.join(" ")).toContain("cannot reach your account");
      expect(existsSync(env["HOME"] ?? "/nonexistent")).toBe(false);
    }
  });

  it("explains an unreadable report, a timeout, and a missing installation", async () => {
    const root = project({});
    const noReport = await runTests({
      root,
      env: {},
      run: () =>
        Promise.resolve(
          result({ exitCode: 1, stderr: "Error: boom\nAWS_SECRET_ACCESS_KEY=hunter2hunter2" }),
        ),
    });
    expect(noReport).toMatchObject({ ok: false, code: "NO_REPORT" });
    expect(JSON.stringify(noReport)).not.toContain("hunter2hunter2");
    const timeout = await runTests({
      root,
      env: {},
      run: () => Promise.resolve(result({ timedOut: true })),
    });
    expect(timeout.ok).toBe(false);
    expect(timeout.ok ? "" : timeout.message).toContain("did not finish");
    rmSync(join(root, "package.json"));
    expect(await runTests({ root, env: {} })).toMatchObject({ ok: false, code: "NO_FRAMEWORK" });
  });
});

describe("runTests with the real vitest", () => {
  it("reports passing and failing tests with the failure tied to its file", async () => {
    const root = project({
      "src/add.ts": "export const add = (a: number, b: number): number => a + b;\n",
      "src/add.t.ts":
        'import { expect, it } from "vitest";\nimport { add } from "./add";\nit("adds", () => { expect(add(1, 2)).toBe(3); });\nit("fails on purpose", () => { expect(add(1, 2)).toBe(4); });\nit.skip("skipped", () => {});\n',
    });
    const outcome = await runTests({ root, env: { PATH: process.env["PATH"] } });
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.report).toMatchObject({ framework: "vitest", passed: 1, failed: 1, skipped: 1 });
    expect(outcome.report.failures[0]?.name).toContain("fails on purpose");
    expect(outcome.report.failures[0]?.file).toContain("add.t.ts");
    expect(outcome.report.failures[0]?.message).toContain("expected 3 to be 4");
  }, 60_000);

  it("runs only the tests related to a changed file", async () => {
    const root = project({
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
      "src/a.t.ts":
        'import { expect, it } from "vitest";\nimport { a } from "./a";\nit("a", () => { expect(a).toBe(1); });\n',
      "src/b.t.ts":
        'import { expect, it } from "vitest";\nimport { b } from "./b";\nit("b", () => { expect(b).toBe(99); });\n',
    });
    const outcome = await runTests({
      root,
      env: { PATH: process.env["PATH"] },
      related: ["src/a.ts"],
    });
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.report).toMatchObject({ passed: 1, failed: 0, command: "vitest related" });
  }, 60_000);
});

describe("coverage", () => {
  it("reads the json-summary report and lists the weakest files", () => {
    const root = project({});
    mkdirSync(join(root, "coverage"));
    writeFileSync(
      join(root, "coverage", "coverage-summary.json"),
      JSON.stringify({
        total: {
          lines: { pct: 80 },
          branches: { pct: 70.5 },
          functions: { pct: 90 },
          statements: { pct: 80 },
        },
        "/p/a.ts": { lines: { pct: 100 } },
        "/p/b.ts": { lines: { pct: 12.5 } },
        "/p/c.ts": { lines: { pct: "Unknown" } },
      }),
    );
    const { summary } = readCoverage(join(root, "coverage"));
    expect(summary?.totals.branches).toBe(70.5);
    expect(summary?.weakest.map((entry) => entry.file)).toEqual(["/p/b.ts", "/p/a.ts"]);
    expect(renderCoverage(summary as NonNullable<typeof summary>)).toContain(
      "does not show that they checked the right things",
    );
  });

  it("explains a missing, invalid, or empty report", () => {
    const root = project({});
    expect(readCoverage(join(root, "coverage")).reason).toContain("--coverage");
    mkdirSync(join(root, "coverage"));
    writeFileSync(join(root, "coverage", "coverage-summary.json"), "{ no");
    expect(readCoverage(join(root, "coverage")).reason).toContain("not valid JSON");
    writeFileSync(join(root, "coverage", "coverage-summary.json"), "{}");
    expect(readCoverage(join(root, "coverage")).reason).toContain("no totals");
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain("vitest");
  });
});

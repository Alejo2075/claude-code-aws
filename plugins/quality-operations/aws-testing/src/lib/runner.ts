// Runs the project's own test framework. Tests run with an allowlisted environment, a private HOME
// and no AWS variables, so a unit test cannot reach the developer's AWS account by accident. Output
// is read from the framework's JSON report, redacted, and bounded.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type TestFailure, type TestReport } from "@claude-code-aws/report-contract";
import { safeText } from "@claude-code-aws/safe-output";
import {
  findOnPath,
  findPackageBin,
  type RunOptions,
  type RunResult,
  runTool,
  scrubbedEnv,
} from "@claude-code-aws/tool-runner";

export type Framework = "vitest" | "jest" | "node:test";
export type Runner = (options: RunOptions) => Promise<RunResult>;

export const DEFAULT_TEST_TIMEOUT_MS = 300_000;
const MAX_FAILURES = 25;

/** The framework a project uses, from its package.json dependencies. */
export function detectFramework(root: string): Framework | null {
  try {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    const dependencies = { ...manifest["dependencies"], ...manifest["devDependencies"] };
    if (dependencies["vitest"] !== undefined) return "vitest";
    if (dependencies["jest"] !== undefined) return "jest";
    return "node:test";
  } catch {
    return null;
  }
}

export interface Plan {
  framework: Framework;
  command: string;
  args: string[];
  display: string;
  /** Where the JSON report will be, if the framework writes one. */
  reportFile: string | null;
}

export interface PlanOptions {
  root: string;
  framework: Framework;
  /** Changed files; the framework itself decides which tests relate to them. */
  related?: readonly string[];
  coverage?: boolean;
  /** A directory for the report file. */
  scratch: string;
}

/** Builds the command line. The framework runs through node from the project's own installation. */
export function planRun(options: PlanOptions): Plan | { error: string } {
  const { framework, related, coverage, scratch } = options;
  if (framework === "node:test") {
    return {
      framework,
      command: process.execPath,
      args: ["--test", "--test-reporter=tap"],
      display: "node --test",
      reportFile: null,
    };
  }
  const bin = findPackageBin(options.root, framework, framework);
  if (bin === null)
    return {
      error: `${framework} is listed in package.json but is not installed. Install the project's dependencies first.`,
    };
  const reportFile = join(scratch, "report.json");
  const files = [...(related ?? [])];
  if (framework === "vitest") {
    const args = [
      bin,
      ...(files.length > 0 ? ["related", ...files, "--run"] : ["run"]),
      "--reporter=json",
      `--outputFile=${reportFile}`,
      "--passWithNoTests",
      ...(coverage === true
        ? ["--coverage", "--coverage.reporter=json-summary", "--coverage.reporter=text-summary"]
        : []),
    ];
    return {
      framework,
      command: process.execPath,
      args,
      display: `vitest ${files.length > 0 ? "related" : "run"}`,
      reportFile,
    };
  }
  const args = [
    bin,
    "--json",
    `--outputFile=${reportFile}`,
    "--passWithNoTests",
    ...(files.length > 0 ? ["--findRelatedTests", ...files] : []),
    ...(coverage === true ? ["--coverage", "--coverageReporters=json-summary"] : []),
  ];
  return {
    framework,
    command: process.execPath,
    args,
    display: `jest${files.length > 0 ? " --findRelatedTests" : ""}`,
    reportFile,
  };
}

interface JestLike {
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numTodoTests?: number;
  testResults?: Array<{
    name?: string;
    message?: string;
    assertionResults?: Array<{
      status?: string;
      fullName?: string;
      title?: string;
      failureMessages?: string[];
    }>;
  }>;
}

const clean = (text: string, lines = 6): string =>
  safeText(text, { maxLines: lines, maxLineLength: 300 }).text;

/** Reads the Jest-compatible JSON report that Vitest and Jest write. */
export function parseJestJson(
  text: string,
): Pick<TestReport, "passed" | "failed" | "skipped" | "failures"> | null {
  let data: JestLike;
  try {
    data = JSON.parse(text) as JestLike;
  } catch {
    return null;
  }
  const failures: TestFailure[] = [];
  for (const file of data.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      if (test.status !== "failed") continue;
      failures.push({
        name: clean(test.fullName ?? test.title ?? "unnamed test", 2),
        ...(file.name === undefined ? {} : { file: file.name }),
        message: clean((test.failureMessages ?? []).join("\n") || file.message || "failed"),
      });
    }
    if (
      (file.assertionResults ?? []).length === 0 &&
      file.message !== undefined &&
      file.message !== ""
    ) {
      failures.push({
        name: "(test file failed to run)",
        ...(file.name === undefined ? {} : { file: file.name }),
        message: clean(file.message),
      });
    }
  }
  return {
    passed: data.numPassedTests ?? 0,
    failed: data.numFailedTests ?? failures.length,
    skipped: (data.numPendingTests ?? 0) + (data.numTodoTests ?? 0),
    failures: failures.slice(0, MAX_FAILURES),
  };
}

/** Reads the summary lines and failures of node:test's TAP output. */
export function parseTap(
  text: string,
): Pick<TestReport, "passed" | "failed" | "skipped" | "failures"> | null {
  const count = (name: string): number | null => {
    const match = new RegExp(`^# ${name} (\\d+)`, "m").exec(text);
    return match === null ? null : Number(match[1]);
  };
  const passed = count("pass");
  const failed = count("fail");
  if (passed === null && failed === null) return null;
  const failures = [...text.matchAll(/^not ok \d+ - (.+)$/gm)]
    .slice(0, MAX_FAILURES)
    .map((match) => ({ name: clean(match[1] ?? "", 1), message: "see the test output" }));
  return { passed: passed ?? 0, failed: failed ?? 0, skipped: count("skipped") ?? 0, failures };
}

export interface RunInput {
  root: string;
  env: Record<string, string | undefined>;
  framework?: Framework;
  related?: readonly string[];
  coverage?: boolean;
  timeoutMs?: number;
  run?: Runner;
  now?: Date;
}

export type RunOutcome =
  | { ok: true; report: TestReport; coverageDir: string | null }
  | {
      ok: false;
      code: "NO_FRAMEWORK" | "NOT_INSTALLED" | "NO_REPORT";
      message: string;
      excerpt: string[];
    };

/** Runs the tests and returns a `TestReport`. */
export async function runTests(input: RunInput): Promise<RunOutcome> {
  const framework = input.framework ?? detectFramework(input.root);
  if (framework === null) {
    return {
      ok: false,
      code: "NO_FRAMEWORK",
      message: "No package.json was found, so the test framework is unknown.",
      excerpt: [],
    };
  }
  const scratch = mkdtempSync(join(tmpdir(), "aws-testing-"));
  const privateHome = mkdtempSync(join(tmpdir(), "aws-testing-home-"));
  try {
    const plan = planRun({
      root: input.root,
      framework,
      scratch,
      ...(input.related === undefined ? {} : { related: input.related }),
      ...(input.coverage === undefined ? {} : { coverage: input.coverage }),
    });
    if ("error" in plan)
      return { ok: false, code: "NOT_INSTALLED", message: plan.error, excerpt: [] };
    const env = scrubbedEnv(input.env, {
      extra: {
        CI: "1",
        NODE_ENV: "test",
        HOME: privateHome,
        USERPROFILE: privateHome,
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_CONFIG_FILE: join(privateHome, "config"),
        AWS_SHARED_CREDENTIALS_FILE: join(privateHome, "credentials"),
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "test",
        AWS_SECRET_ACCESS_KEY: "test",
      },
    });
    const result = await (input.run ?? runTool)({
      command: plan.command,
      args: plan.args,
      root: input.root,
      env,
      timeoutMs: input.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
      maxOutputBytes: 1_000_000,
    });
    const text =
      plan.reportFile !== null && existsSync(plan.reportFile)
        ? readFileSync(plan.reportFile, "utf8")
        : null;
    const parsed =
      text !== null
        ? parseJestJson(text)
        : framework === "node:test"
          ? parseTap(result.stdout)
          : null;
    if (parsed === null) {
      const excerpt = safeText(`${result.stderr}\n${result.stdout}`, {
        maxLines: 15,
        maxLineLength: 240,
      })
        .text.split("\n")
        .filter((line) => line.trim() !== "");
      return {
        ok: false,
        code: "NO_REPORT",
        message: result.timedOut
          ? "The tests did not finish in time."
          : result.spawnError !== null
            ? `The test command could not be started (${result.spawnError}).`
            : "The framework did not produce a readable report.",
        excerpt,
      };
    }
    const report: TestReport = {
      schemaVersion: "1",
      plugin: "aws-testing",
      generatedAt: (input.now ?? new Date()).toISOString(),
      framework,
      command: plan.display,
      ...parsed,
      durationMs: result.durationMs,
      truncated:
        result.stdoutTruncated || result.stderrTruncated || parsed.failures.length >= MAX_FAILURES,
      limitations: [
        "Tests ran with no AWS credentials and a private home directory, so they cannot reach your account.",
        "Mocks and fakes are not AWS integration coverage: a passing unit test does not show that the deployed stack works.",
        ...(result.timedOut ? ["The run hit the time limit; the numbers may be incomplete."] : []),
      ],
    };
    return {
      ok: true,
      report,
      coverageDir: input.coverage === true ? join(input.root, "coverage") : null,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(privateHome, { recursive: true, force: true });
  }
}

/** Changed files according to git, for `--affected`. Empty when git is missing or nothing changed. */
export async function changedFiles(
  root: string,
  env: Record<string, string | undefined>,
  run: Runner = runTool,
): Promise<string[]> {
  const git = findOnPath("git", env["PATH"] ?? env["Path"]);
  if (git === null) return [];
  const names = new Set<string>();
  for (const args of [
    ["diff", "--name-only", "HEAD"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const result = await run({
      command: git,
      args,
      root,
      env: scrubbedEnv(env),
      timeoutMs: 20_000,
      maxOutputBytes: 200_000,
    });
    if (result.exitCode !== 0) continue;
    for (const line of result.stdout.split("\n"))
      if (line.trim() !== "" && /\.(m?[jt]sx?|json)$/.test(line)) names.add(line.trim());
  }
  return [...names]
    .filter(
      (name) => !/(^|\/)node_modules\//.test(name) && !/^(coverage|dist|cdk\.out)\//.test(name),
    )
    .slice(0, 200);
}

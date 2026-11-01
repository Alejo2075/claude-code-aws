import { describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { parseIntegration, runIntegration } from "../src/lib/integration.js";
import type { Runner } from "../src/lib/runner.js";

const ACCOUNT = "111122223333";
const ok = { accountId: ACCOUNT, arn: `arn:aws:iam::${ACCOUNT}:user/tester` };
const result = (over: Partial<Awaited<ReturnType<Runner>>> = {}): Awaited<ReturnType<Runner>> => ({
  exitCode: 0,
  signal: null,
  stdout: "ok\n",
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
  timedOut: false,
  durationMs: 1200,
  spawnError: null,
  ...over,
});
const base = [
  "integration",
  "--account",
  ACCOUNT,
  "--region",
  "us-east-1",
  "--confirm-sandbox",
  "--",
  "npx",
  "vitest",
  "run",
];

function setup(
  over: {
    identity?: () => Promise<typeof ok>;
    known?: () => {
      accountId: string;
      environment: "production" | "non-production" | "unknown";
    } | null;
    run?: Runner;
  } = {},
) {
  const seen: Array<Parameters<Runner>[0]> = [];
  const run: Runner =
    over.run ??
    ((o) => {
      seen.push(o);
      return Promise.resolve(result());
    });
  return {
    seen,
    deps: {
      root: "/tmp",
      env: {
        PATH: "/usr/bin",
        AWS_PROFILE: "personal",
        AWS_ENDPOINT_URL: "http://evil.example",
        AWS_SECRET_ACCESS_KEY: "s3cr3t",
        HOME: "/h",
        NODE_OPTIONS: "--require x",
      },
      integration: {
        identity: over.identity ?? (() => Promise.resolve(ok)),
        known: over.known ?? (() => null),
      },
      run,
    },
  };
}

describe("argument parsing", () => {
  it("needs an account, a region, and a command after --", () => {
    expect(parseIntegration(base).ok).toBe(true);
    expect(parseIntegration(["integration", "--region", "us-east-1", "--", "x"]).ok).toBe(false);
    expect(
      parseIntegration(["integration", "--account", "123", "--region", "us-east-1", "--", "x"]).ok,
    ).toBe(false);
    expect(
      parseIntegration(["integration", "--account", ACCOUNT, "--region", "mars", "--", "x"]).ok,
    ).toBe(false);
    expect(
      parseIntegration(["integration", "--account", ACCOUNT, "--region", "us-east-1"]).ok,
    ).toBe(false);
    expect(parseIntegration([...base.slice(0, 6), "--timeout", "5000", "--", "x"]).ok).toBe(false);
    expect(parseIntegration([...base, "a\u0000b"]).ok).toBe(false);
  });
});

describe("safety checks before anything runs", () => {
  it("refuses when the verified account is not the named one", async () => {
    const s = setup({ identity: () => Promise.resolve({ accountId: "999999999999", arn: "x" }) });
    const r = await runCli(base, s.deps);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/different account/);
    expect(s.seen).toHaveLength(0);
  });
  it("refuses when the identity cannot be verified", async () => {
    const s = setup({ identity: () => Promise.reject(new Error("expired")) });
    expect((await runCli(base, s.deps)).stdout).toMatch(/could not be verified/);
    expect(s.seen).toHaveLength(0);
  });
  it("refuses a production classification even when confirmed", async () => {
    const s = setup({ known: () => ({ accountId: ACCOUNT, environment: "production" }) });
    const r = await runCli(base, s.deps);
    expect(r.stdout).toMatch(/classified as production/);
    expect(s.seen).toHaveLength(0);
  });
  it("does not run without the sandbox confirmation and explains what would happen", async () => {
    const s = setup();
    const r = await runCli(
      base.filter((a) => a !== "--confirm-sandbox"),
      s.deps,
    );
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/NOT RUN/);
    expect(r.stdout).toMatch(/sandbox/);
    expect(s.seen).toHaveLength(0);
  });
  it("is unavailable without an identity adapter", async () => {
    expect((await runCli(base, { root: "/tmp", env: {} })).exitCode).toBe(2);
  });
});

describe("the run", () => {
  it("passes the profile and region but not an endpoint override, NODE_OPTIONS, or HOME, and does not use a shell", async () => {
    const s = setup();
    const r = await runCli(base, s.deps);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/PASSED/);
    expect(r.stdout).toMatch(/real run with real credentials/);
    const o = s.seen[0];
    expect(o?.command).toBe("npx");
    expect(o?.args).toEqual(["vitest", "run"]);
    expect(o?.env["AWS_PROFILE"]).toBe("personal");
    expect(o?.env["AWS_REGION"]).toBe("us-east-1");
    expect(o?.env["AWS_ENDPOINT_URL"]).toBeUndefined();
    expect(o?.env["NODE_OPTIONS"]).toBeUndefined();
    expect(o?.timeoutMs).toBe(300_000);
  });
  it("reports a failure and a timeout, and redacts secrets in the output", async () => {
    const fail = setup({
      run: () => Promise.resolve(result({ exitCode: 1, stdout: "token=abcdef123456 failed\n" })),
    });
    const r = await runCli(base, fail.deps);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/FAILED \(exit 1\)/);
    expect(r.stdout).not.toContain("abcdef123456");
    const slow = setup({ run: () => Promise.resolve(result({ exitCode: null, timedOut: true })) });
    const t = await runCli(base, slow.deps);
    expect(t.exitCode).toBe(1);
    expect(t.stdout).toMatch(/TIMED OUT/);
  });
  it("reports a command that could not start", async () => {
    const s = setup({ run: () => Promise.resolve(result({ spawnError: "ENOENT" })) });
    const r = await runIntegrationDirect(s);
    expect(r).toMatch(/could not be started/);
  });
});

async function runIntegrationDirect(s: ReturnType<typeof setup>): Promise<string> {
  const parsed = parseIntegration(base);
  if (!parsed.ok) throw new Error(parsed.error);
  const o = await runIntegration(parsed.args, {
    root: "/tmp",
    env: {},
    ...s.deps.integration,
    run: s.deps.run,
  });
  return o.ran ? "ran" : o.reason;
}

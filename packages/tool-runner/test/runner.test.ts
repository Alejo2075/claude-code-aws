import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findLocalBin,
  findOnPath,
  findPackageBin,
  isInside,
  runTool,
  scrubbedEnv,
} from "../src/index.js";

const node = process.execPath;
const root = mkdtempSync(join(tmpdir(), "tool-runner-"));
const run = (code: string, overrides: Partial<Parameters<typeof runTool>[0]> = {}) =>
  runTool({
    command: node,
    args: ["-e", code],
    root,
    env: scrubbedEnv(process.env),
    timeoutMs: 10_000,
    maxOutputBytes: 10_000,
    ...overrides,
  });

describe("scrubbedEnv", () => {
  const source = {
    PATH: "/bin",
    HOME: "/home/x",
    AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
    AWS_SECRET_ACCESS_KEY: "s",
    AWS_PROFILE: "prod",
    GITHUB_TOKEN: "t",
    NODE_OPTIONS: "--require x",
    NPM_TOKEN: "n",
  };

  it("keeps only what a build tool needs, and no AWS or token variables", () => {
    expect(scrubbedEnv(source)).toEqual({ PATH: "/bin", HOME: "/home/x" });
  });

  it("passes AWS variables only on request, and still no tokens", () => {
    const env = scrubbedEnv(source, { allowAws: true });
    expect(env["AWS_PROFILE"]).toBe("prod");
    expect(env["AWS_ACCESS_KEY_ID"]).toBe("AKIAEXAMPLE");
    expect(env["GITHUB_TOKEN"]).toBeUndefined();
    expect(env["NODE_OPTIONS"]).toBeUndefined();
  });

  it("adds extra variables last", () => {
    expect(scrubbedEnv(source, { extra: { CI: "1" } })["CI"]).toBe("1");
  });
});

describe("runTool", () => {
  it("runs a program without a shell and returns bounded output", async () => {
    const result = await run("console.log('hello'); console.error('warn')");
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "hello\n",
      stderr: "warn\n",
      timedOut: false,
      spawnError: null,
    });
  });

  it("does not interpret shell syntax in arguments", async () => {
    const result = await runTool({
      command: node,
      args: ["-p", "process.argv[1]", "a; echo pwned $(id) `id`"],
      root,
      env: scrubbedEnv(process.env),
      timeoutMs: 10_000,
      maxOutputBytes: 1000,
    });
    expect(result.stdout.trim()).toBe("a; echo pwned $(id) `id`");
  });

  it("gives the child the scrubbed environment only", async () => {
    process.env["AWS_SECRET_ACCESS_KEY"] = "must-not-leak";
    const result = await run(
      "console.log(JSON.stringify(Object.keys(process.env).filter((k) => k.startsWith('AWS'))))",
    );
    delete process.env["AWS_SECRET_ACCESS_KEY"];
    expect(result.stdout.trim()).toBe("[]");
  });

  it("reports a non-zero exit", async () => {
    expect((await run("process.exit(3)")).exitCode).toBe(3);
  });

  it("stops a process that runs too long and says so", async () => {
    const started = Date.now();
    const result = await run("setInterval(() => {}, 1000)", { timeoutMs: 400 });
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("truncates output and says which stream", async () => {
    const result = await run("process.stdout.write('x'.repeat(50000)); console.error('e')", {
      maxOutputBytes: 100,
    });
    expect(result.stdout).toHaveLength(100);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(false);
  });

  it("reports a missing executable instead of throwing", async () => {
    const result = await run("", { command: join(root, "no-such-program") });
    expect(result.spawnError).toBe("ENOENT");
    expect(result.exitCode).toBeNull();
  });

  it("refuses a working directory outside the project", async () => {
    const result = await run("console.log(1)", { cwd: tmpdir() });
    expect(result.spawnError).toContain("outside the project");
  });
});

describe("Windows shims", () => {
  it.runIf(process.platform === "win32")(
    "refuses to run a .cmd shim, which would need a shell",
    async () => {
      const result = await run("", { command: join(root, "tool.cmd") });
      expect(result.spawnError).toContain("UNSUPPORTED_WINDOWS_SHIM");
    },
  );
});

describe("findPackageBin", () => {
  it("finds a package's JavaScript entry by walking up, from the string or the object form of bin", () => {
    const pkg = join(root, "node_modules", "fake-cli");
    mkdirSync(join(pkg, "bin"), { recursive: true });
    writeFileSync(join(pkg, "bin", "run.js"), "console.log('hi')");
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "fake-cli", bin: { fake: "bin/run.js" } }),
    );
    mkdirSync(join(root, "a", "b"), { recursive: true });
    expect(findPackageBin(join(root, "a", "b"), "fake-cli", "fake")).toBe(
      join(pkg, "bin", "run.js"),
    );
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "fake-cli", bin: "bin/run.js" }),
    );
    expect(findPackageBin(root, "fake-cli")).toBe(join(pkg, "bin", "run.js"));
  });

  it("returns null for a missing package, a missing bin, or a bin that escapes the package", () => {
    expect(findPackageBin(root, "no-such-package")).toBeNull();
    const pkg = join(root, "node_modules", "odd-cli");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "odd-cli", bin: { other: "x.js" } }),
    );
    expect(findPackageBin(root, "odd-cli", "odd-cli")).toBeNull();
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "odd-cli", bin: "../../escape.js" }),
    );
    writeFileSync(join(root, "escape.js"), "");
    expect(findPackageBin(root, "odd-cli")).toBeNull();
  });
});

describe("paths", () => {
  it("judges containment after resolving links", () => {
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    mkdirSync(join(root, "sub"), { recursive: true });
    symlinkSync(outside, join(root, "link"), "junction");
    expect(isInside(root, join(root, "sub"))).toBe(true);
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, join(root, "..", "x"))).toBe(false);
    expect(isInside(root, join(root, "link"))).toBe(false);
  });

  it("finds local bins by walking up, and executables on PATH", () => {
    const bin = join(root, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const name = process.platform === "win32" ? "tool.cmd" : "tool";
    writeFileSync(join(bin, name), "");
    mkdirSync(join(root, "deep", "er"), { recursive: true });
    expect(findLocalBin(join(root, "deep", "er"), "tool")).toBe(join(bin, name));
    expect(findLocalBin(root, "absent-tool")).toBeNull();
    expect(findOnPath("tool", bin)).toBe(join(bin, name));
    expect(findOnPath("tool", undefined)).toBeNull();
  });
});

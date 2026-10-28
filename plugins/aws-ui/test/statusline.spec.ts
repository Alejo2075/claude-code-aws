// Runs the bundled status-line script (requires `pnpm build`, which CI runs before testing).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AwsContextSnapshotV1,
  serializeSnapshot,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";
import { findSecretLikeStrings } from "@claude-code-aws/testkit";
import { runProcess } from "../../../packages/testkit/src/run-hook.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "statusline.mjs");
const built = existsSync(script);

let home: string;
let project: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "aws-ui-home-"));
  project = mkdtempSync(join(tmpdir(), "aws-ui-project-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const env = (): NodeJS.ProcessEnv => ({
  PATH: process.env["PATH"] ?? "",
  CLAUDE_CONFIG_DIR: join(home, ".claude"),
  HOME: home,
  USERPROFILE: home,
});

const read = (name: string) => (key: string) =>
  key === "CLAUDE_CONFIG_DIR" ? join(home, ".claude") : name && undefined;

async function storeSnapshot(overrides: Partial<AwsContextSnapshotV1> = {}): Promise<void> {
  const id = await workspaceId(project);
  const now = Date.now();
  const snapshot: AwsContextSnapshotV1 = {
    schemaVersion: 1,
    workspaceId: id,
    profile: null,
    region: "eu-west-1",
    accountId: "123456789012",
    principalArn: "arn:aws:sts::123456789012:assumed-role/Developer/carol",
    environment: "production",
    verification: "verified",
    verifiedAt: new Date(now - 1000).toISOString(),
    staleAfter: new Date(now + 300_000).toISOString(),
    diagnosticCode: null,
    ...overrides,
  };
  const path = snapshotPath(read("x"), id);
  if (path === null) throw new Error("no path");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeSnapshot(snapshot));
}

async function run(stdin: unknown, args: string[] = []) {
  return runProcess(process.execPath, [script, ...args], stdin, env(), project, 20_000);
}

const session = () => ({ workspace: { project_dir: project, current_dir: project } });

describe.runIf(built)("status-line script (bundled)", () => {
  it("prints nothing with no snapshot", async () => {
    const result = await run(session());
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("prints user, region and environment, with no warning when verified", async () => {
    await storeSnapshot();
    const result = await run(session());
    expect(result.stdout.trim()).toBe("carol · eu-west-1 · production");
    expect(result.stdout).not.toContain("123456789012");
    expect(result.secretFindings).toEqual([]);
  });

  it("warns, keeping the last known identity, when the verification is old", async () => {
    const old = Date.now() - 3_600_000;
    await storeSnapshot({
      verifiedAt: new Date(old).toISOString(),
      staleAfter: new Date(old + 300_000).toISOString(),
    });
    const line = (await run(session())).stdout.trim();
    expect(line).toBe("carol · eu-west-1 · production · AWS check stale");
  });

  it("does not show another workspace's snapshot", async () => {
    await storeSnapshot();
    const other = mkdtempSync(join(tmpdir(), "aws-ui-other-"));
    try {
      const result = await run({ workspace: { project_dir: other } });
      expect(result.stdout.trim()).toBe("");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["empty input", ""],
    ["wrong types", { workspace: { project_dir: 42 }, cwd: [] }],
    ["null", null],
  ])("never fails the status line on %s", async (_name, stdin) => {
    const result = await runProcess(
      process.execPath,
      [script],
      typeof stdin === "string" ? undefined : stdin,
      env(),
      project,
      20_000,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("ignores a corrupt snapshot file", async () => {
    await storeSnapshot();
    const path = snapshotPath(read("x"), await workspaceId(project));
    writeFileSync(path ?? "", "{ truncated");
    expect((await run(session())).stdout.trim()).toBe("");
  });
});

describe.runIf(built)("status-line setup", () => {
  const secret = "AKIAIOSFODNN7EXAMPLE";
  const settingsPath = () => join(home, ".claude", "settings.json");

  function writeSettings(content: object): string {
    mkdirSync(join(home, ".claude"), { recursive: true });
    const text = JSON.stringify(content, null, 2);
    writeFileSync(settingsPath(), text);
    return text;
  }

  it("prints a snippet and changes nothing when no statusLine exists", async () => {
    const before = writeSettings({ env: { AWS_ACCESS_KEY_ID: secret }, theme: "dark" });
    const result = await run({}, ["setup"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"statusLine"');
    expect(result.stdout).toContain("no statusLine configured");
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
    expect(result.stdout).not.toContain(secret);
    expect(findSecretLikeStrings(result.stdout)).toEqual([]);
    expect(existsSync(join(home, ".claude", "aws-ui"))).toBe(false);
  });

  it("works with no settings file at all", async () => {
    const result = await run({}, ["setup"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("no statusLine configured");
  });

  it("detects an existing statusLine, preserves it, and reveals nothing else", async () => {
    const before = writeSettings({
      env: { AWS_ACCESS_KEY_ID: secret },
      statusLine: { type: "command", command: "~/my-line.sh" },
    });
    const result = await run({}, ["setup"]);
    expect(result.stdout).toContain("already have a statusLine");
    expect(result.stdout).toContain("~/my-line.sh");
    expect(result.stdout).not.toContain(secret);
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  });

  it("survives malformed settings", async () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(settingsPath(), "{ not json");
    expect((await run({}, ["setup"])).exitCode).toBe(0);
  });

  it("with --copy writes exactly one file, a working copy, and still leaves settings alone", async () => {
    const before = writeSettings({ theme: "dark" });
    const result = await run({}, ["setup", "--copy"]);
    expect(result.stdout).toContain("Copied the status-line script");
    const dir = join(home, ".claude", "aws-ui");
    expect(readdirSync(dir)).toEqual(["statusline.mjs"]);
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
    // The copy is self-contained and runs.
    const copy = await runProcess(
      process.execPath,
      [join(dir, "statusline.mjs")],
      session(),
      env(),
      project,
      20_000,
    );
    expect(copy.exitCode).toBe(0);
    expect(copy.stdout.trim()).toBe("");
  });

  it("writes the snippet path with forward slashes", async () => {
    const result = await run({}, ["setup", "--copy"]);
    const match = /"command": "node (.+)"/.exec(result.stdout);
    expect(match?.[1]).toBeDefined();
    expect(match?.[1]).not.toContain("\\\\");
  });
});

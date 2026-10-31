// Runs the bundled CLI the way a user does, with no AWS reachable. Requires `pnpm build`.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findSecretLikeStrings } from "@claude-code-aws/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runProcess } from "../../../packages/testkit/src/run-hook.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.mjs");
let home: string;
let project: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "aws-deploy-home-"));
  project = mkdtempSync(join(tmpdir(), "aws-deploy-proj-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const run = (args: string[]) =>
  runProcess(
    process.execPath,
    [cli, ...args],
    {},
    {
      PATH: process.env["PATH"] ?? "",
      HOME: home,
      USERPROFILE: home,
      CLAUDE_CONFIG_DIR: join(home, ".claude"),
      CLAUDE_PROJECT_DIR: project,
      AWS_EC2_METADATA_DISABLED: "true",
      AWS_ENDPOINT_URL: "http://127.0.0.1:1",
      AWS_REGION: "us-east-1",
    },
    project,
    30_000,
  );

describe.runIf(existsSync(cli))("aws-deploy CLI (bundled)", () => {
  it("blocks the plan when the identity cannot be verified, and saves nothing", async () => {
    const result = await run(["plan"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("✖ Identity");
    expect(result.stdout).toContain("Blocked");
    expect(existsSync(join(home, ".claude", "aws-deploy"))).toBe(false);
  });

  it("refuses to deploy a plan that does not exist", async () => {
    const result = await run(["deploy", "0123456789abcdef"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("There is no such plan");
  });

  it("prints a pipeline without writing it, with no credentials in it", async () => {
    const result = await run([
      "pipeline",
      "--account",
      "123456789012",
      "--region",
      "us-east-1",
      "--repo",
      "o/r",
      "--environment",
      "production",
    ]);
    expect(result.stdout).toContain("nothing was written");
    expect(result.stdout).toContain("id-token: write");
    expect(findSecretLikeStrings(result.stdout)).toEqual([]);
    expect(existsSync(join(project, ".github"))).toBe(false);
  });

  it("exits 2 on bad input and offers no destroy verb", async () => {
    expect((await run(["destroy"])).exitCode).toBe(2);
    expect((await run(["pipeline", "--account", "nope"])).exitCode).toBe(2);
  });
});

// Runs the bundled PreToolUse hook the way Claude Code does: stdin payload in, exit code and JSON
// out. Local files only: the guard makes no network or AWS call. Requires `pnpm build`.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { serializeSnapshot, snapshotPath, workspaceId } from "@claude-code-aws/context-contract";
import {
  bashPreToolUseInput,
  commonInput,
  findSecretLikeStrings,
  type HookResult,
  preToolUseInput,
  runPluginHooks,
} from "@claude-code-aws/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { snapshot } from "./helpers.js";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = existsSync(join(pluginRoot, "dist", "pre-tool-use.mjs"));

let home: string;
let project: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "aws-guard-home-"));
  project = mkdtempSync(join(tmpdir(), "aws-guard-project-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const env = (extra: Record<string, string> = {}): Record<string, string> => ({
  CLAUDE_CONFIG_DIR: join(home, ".claude"),
  AWS_PROFILE: "dev",
  ...extra,
});

async function store(environment: "production" | "non-production" | "unknown"): Promise<void> {
  const id = await workspaceId(project);
  const path = snapshotPath((name) => env()[name], id);
  if (path === null) throw new Error("no path");
  mkdirSync(dirname(path), { recursive: true });
  const now = Date.now();
  writeFileSync(
    path,
    serializeSnapshot(
      snapshot({
        workspaceId: id,
        environment,
        verifiedAt: new Date(now - 1000).toISOString(),
        staleAfter: new Date(now + 300_000).toISOString(),
      }),
    ),
  );
}

async function run(
  input = bashPreToolUseInput(project, "aws s3 ls"),
  extra = {},
): Promise<HookResult> {
  const [result] = await runPluginHooks(input, {
    pluginRoot,
    projectDir: project,
    env: env(extra),
    timeoutMs: 20_000,
  });
  if (result === undefined) throw new Error("the hook did not run");
  return result;
}

const bash = (command: string, mode?: "bypassPermissions" | "dontAsk" | "plan") =>
  mode === undefined
    ? bashPreToolUseInput(project, command)
    : { ...bashPreToolUseInput(project, command), permission_mode: mode };

function decision(result: HookResult): { decision: string; reason: string } | null {
  const output = result.json?.["hookSpecificOutput"] as
    | { hookEventName: string; permissionDecision: string; permissionDecisionReason: string }
    | undefined;
  if (output === undefined) return null;
  expect(output.hookEventName).toBe("PreToolUse");
  return { decision: output.permissionDecision, reason: output.permissionDecisionReason };
}

describe.runIf(built)("PreToolUse hook (bundled)", () => {
  it("registers for Bash and MCP tools only, with a blocking failure policy", () => {
    const file = JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<Record<string, unknown>> }> };
    };
    const group = file.hooks.PreToolUse[0];
    expect(group?.matcher).toBe("^(Bash|mcp__.*)$");
    expect(group?.hooks[0]).toMatchObject({ type: "command", command: "node", onFailure: "block" });
  });

  it("prints nothing for unrelated commands and for reads", async () => {
    await store("production");
    for (const command of ["npm test", "git status", "aws s3 ls", "cdk diff", "terraform plan"]) {
      const result = await run(bash(command));
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    }
  });

  it("asks before a change in production, with a reason that names the account masked", async () => {
    await store("production");
    const result = await run(bash("cdk deploy"));
    expect(result.exitCode).toBe(0);
    const made = decision(result);
    expect(made?.decision).toBe("ask");
    expect(made?.reason).toContain("production");
    expect(made?.reason).toContain("1234…9012");
    expect(made?.reason).not.toContain("123456789012");
    expect(result.secretFindings).toEqual([]);
  });

  it("is quiet for a change in a verified non-production account", async () => {
    await store("non-production");
    expect((await run(bash("cdk deploy"))).stdout).toBe("");
  });

  it("asks for a change when nothing is verified, and for destructive operations anywhere", async () => {
    expect(decision(await run(bash("cdk deploy")))?.decision).toBe("ask");
    await store("non-production");
    expect(decision(await run(bash("aws s3 rb s3://bucket")))?.decision).toBe("ask");
  });

  it("notices a profile that differs from the verified one", async () => {
    await store("non-production");
    const made = decision(await run(bash("aws s3 cp a s3://b/a --profile prod")));
    expect(made?.decision).toBe("ask");
    expect(made?.reason).toContain("prod");
  });

  it("denies instead of asking in modes where nobody can answer", async () => {
    await store("production");
    for (const mode of ["bypassPermissions", "dontAsk"] as const) {
      expect(decision(await run(bash("cdk deploy", mode)))?.decision).toBe("deny");
    }
    expect(decision(await run(bash("cdk deploy", "plan")))?.decision).toBe("ask");
  });

  it("never allows anything", async () => {
    await store("production");
    for (const command of [
      "cdk deploy",
      "cdk destroy",
      "aws s3 ls",
      "echo hi",
      "aws s3 rb s3://b",
    ]) {
      expect(decision(await run(bash(command)))?.decision ?? "none").not.toBe("allow");
    }
  });

  it("applies the user's deny rules", async () => {
    await store("non-production");
    const dir = join(home, ".claude", "aws-guard");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ version: 1, deny: [{ command: "aws iam delete-*" }] }),
    );
    expect(decision(await run(bash("aws iam delete-user --user-name u")))?.decision).toBe("deny");
  });

  it("does not let a project file loosen the guard", async () => {
    writeFileSync(
      join(project, ".aws-guard.json"),
      JSON.stringify({ version: 1, onUnverified: "ignore", unattended: "ask" }),
    );
    expect(decision(await run(bash("cdk deploy")))?.decision).toBe("ask");
    expect(decision(await run(bash("cdk deploy", "dontAsk")))?.decision).toBe("deny");
  });

  it("does not leak inline credentials", async () => {
    const result = await run(
      bash(
        "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE aws s3 rm s3://b/k",
      ),
    );
    expect(decision(result)?.decision).toBe("ask");
    expect(result.stdout).not.toContain("wJalrXUtnFEMI");
    expect(result.stdout).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(findSecretLikeStrings(result.stdout)).toEqual([]);
  });

  it("checks MCP tools of AWS servers and ignores the rest", async () => {
    await store("production");
    const write = preToolUseInput(project, "mcp__plugin_databases-on-aws_aurora-dsql__transact", {
      sql: ["DROP TABLE t"],
    });
    expect(decision(await run(write))?.decision).toBe("ask");
    const docs = preToolUseInput(
      project,
      "mcp__awslabs-documentation-mcp-server__search_documentation",
      { q: "x" },
    );
    expect((await run(docs)).stdout).toBe("");
    const other = preToolUseInput(project, "mcp__playwright__browser_click", {});
    expect((await run(other)).stdout).toBe("");
  });

  it("parses a CLI command carried by an MCP tool", async () => {
    await store("non-production");
    const input = preToolUseInput(project, "mcp__plugin_aws-core_aws-mcp__call_aws", {
      cli_command: "aws s3 rb s3://b",
    });
    expect(decision(await run(input))?.decision).toBe("ask");
  });

  it("fails closed on input it cannot read, and exits 0 for nothing to do", async () => {
    const broken = { ...commonInput("PreToolUse", project), cwd: undefined } as never;
    const result = await run(broken);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).not.toBe("");
    const noCommand = preToolUseInput(project, "Bash", {});
    expect((await run(noCommand)).exitCode).toBe(0);
  });

  it("answers within a small time budget", async () => {
    await store("production");
    const started = Date.now();
    await run(bash("cdk deploy"));
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

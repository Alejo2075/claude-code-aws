// Runs the bundled CLI and SessionStart hook against a fake STS endpoint on loopback. No AWS
// account and no network beyond 127.0.0.1. Requires `pnpm build` (CI builds before testing).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findSecretLikeStrings, runPluginHooks, sessionStartInput } from "@claude-code-aws/testkit";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runProcess } from "../../../packages/testkit/src/run-hook.js";
import type { StatusReport } from "../src/lib/report.js";
import { ACCOUNT, ARN } from "./helpers.js";

function parse(text: string): StatusReport & { saved?: boolean; removed?: number } {
  return JSON.parse(text) as StatusReport & { saved?: boolean; removed?: number };
}

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(pluginRoot, "dist", "cli.mjs");
const built = existsSync(cli);

// Credential-shaped values that must never appear in any output or stored file.
const SECRET_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const SECRET_TOKEN = "IQoJb3JpZ2luX2VjEXAMPLETOKEN".repeat(6);

type Mode = "ok" | "expired" | "hang";
let mode: Mode = "ok";
let server: Server;
let endpoint = "";
let home: string;
let project: string;

const OK_XML = `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Arn>${ARN}</Arn><UserId>AROAEXAMPLE:session</UserId><Account>${ACCOUNT}</Account></GetCallerIdentityResult><ResponseMetadata><RequestId>req-1</RequestId></ResponseMetadata></GetCallerIdentityResponse>`;
const EXPIRED_XML = `<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><Error><Type>Sender</Type><Code>ExpiredToken</Code><Message>The security token included in the request is expired (${SECRET_TOKEN.slice(0, 20)})</Message></Error><RequestId>req-2</RequestId></ErrorResponse>`;

beforeAll(async () => {
  server = createServer((request, response) => {
    request.resume();
    if (mode === "hang") return;
    const expired = mode === "expired";
    response.writeHead(expired ? 403 : 200, { "content-type": "text/xml" });
    response.end(expired ? EXPIRED_XML : OK_XML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  mode = "ok";
  home = mkdtempSync(join(tmpdir(), "aws-context-home-"));
  project = mkdtempSync(join(tmpdir(), "aws-context-project-"));
  writeFileSync(join(home, "empty-aws-file"), "");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

function awsEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    HOME: home,
    USERPROFILE: home,
    CLAUDE_PROJECT_DIR: project,
    // Isolate from the developer's real AWS setup and from instance metadata.
    AWS_CONFIG_FILE: join(home, "empty-aws-file"),
    AWS_SHARED_CREDENTIALS_FILE: join(home, "empty-aws-file"),
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_ENDPOINT_URL_STS: endpoint,
    ...extra,
  };
}

const credentials = {
  AWS_ACCESS_KEY_ID: SECRET_KEY_ID,
  AWS_SECRET_ACCESS_KEY: SECRET_KEY,
  AWS_SESSION_TOKEN: SECRET_TOKEN,
  AWS_REGION: "us-east-1",
};

async function cliRun(args: string[], env: Record<string, string>) {
  const fullEnv: NodeJS.ProcessEnv = { ...env, PATH: process.env["PATH"] ?? "" };
  return runProcess(process.execPath, [cli, ...args], {}, fullEnv, project, 30_000);
}

function storedFiles(): string[] {
  const dir = join(home, ".claude", "aws-context", "v1");
  return existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : [];
}

function assertNoSecrets(text: string): void {
  for (const secret of [SECRET_KEY_ID, SECRET_KEY, SECRET_TOKEN, SECRET_TOKEN.slice(0, 20)]) {
    expect(text).not.toContain(secret);
  }
  expect(findSecretLikeStrings(text)).toEqual([]);
}

describe.runIf(built)("aws-context CLI (bundled)", () => {
  it("reports not configured before any refresh, without touching the network", async () => {
    const result = await cliRun(["status", "--json"], awsEnv());
    expect(result.exitCode).toBe(0);
    expect(parse(result.stdout)).toMatchObject({
      state: "not-configured",
      snapshot: null,
      isCurrent: false,
    });
    expect(storedFiles()).toEqual([]);
  });

  it("verifies through STS, stores a private snapshot, and then reads it back", async () => {
    // A named profile with static keys in an isolated credentials file (the SDK reads the file).
    const credentialsFile = join(home, "credentials");
    writeFileSync(
      credentialsFile,
      `[dev]\naws_access_key_id = ${SECRET_KEY_ID}\naws_secret_access_key = ${SECRET_KEY}\nregion = us-east-1\n`,
    );
    const refreshed = await cliRun(
      ["refresh", "--json"],
      awsEnv({ AWS_PROFILE: "dev", AWS_SHARED_CREDENTIALS_FILE: credentialsFile }),
    );
    expect(refreshed.exitCode).toBe(0);
    expect(parse(refreshed.stdout)).toMatchObject({
      state: "verified",
      isCurrent: true,
      saved: true,
      snapshot: { accountId: ACCOUNT, region: "us-east-1", profile: "dev", environment: "unknown" },
    });
    const files = storedFiles();
    expect(files).toHaveLength(1);
    if (process.platform !== "win32") expect(statSync(files[0] ?? "").mode & 0o077).toBe(0);

    const status = await cliRun(["status", "--json"], awsEnv());
    expect(parse(status.stdout)).toMatchObject({ state: "verified", isCurrent: true });
    for (const text of [refreshed.stdout, status.stdout, readFileSync(files[0] ?? "", "utf8")])
      assertNoSecrets(text);
  });

  it("applies the user's environment mapping to the account STS reports", async () => {
    mkdirConfig({ accounts: { [ACCOUNT]: { environment: "production" } } });
    const result = await cliRun(["refresh", "--json"], awsEnv(credentials));
    expect(parse(result.stdout).snapshot?.environment).toBe("production");
  });

  it("ignores a repository file that tries to mark the account non-production", async () => {
    writeFileSync(
      join(project, ".aws-context.json"),
      JSON.stringify({ version: 1, accounts: { [ACCOUNT]: { environment: "non-production" } } }),
    );
    const result = await cliRun(["refresh", "--json"], awsEnv(credentials));
    const report = parse(result.stdout);
    expect(report.snapshot?.environment).toBe("unknown");
    expect(report.environmentBasis).toBe("default");
  });

  it("reports expired credentials as expired and keeps the last known account non-current", async () => {
    await cliRun(["refresh"], awsEnv(credentials));
    mode = "expired";
    const result = await cliRun(["refresh", "--json"], awsEnv(credentials));
    const report = parse(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      state: "expired",
      isCurrent: false,
      snapshot: { accountId: ACCOUNT, diagnosticCode: "CREDENTIALS_EXPIRED" },
    });
    expect(report.help).toContain("expired");
    assertNoSecrets(
      result.stdout +
        result.stderr +
        storedFiles()
          .map((file) => readFileSync(file, "utf8"))
          .join("\n"),
    );
  });

  it("reports an unreachable endpoint as offline", async () => {
    const result = await cliRun(
      ["refresh", "--json"],
      awsEnv({ ...credentials, AWS_ENDPOINT_URL_STS: "http://127.0.0.1:1" }),
    );
    expect(result.exitCode).toBe(0);
    expect(parse(result.stdout)).toMatchObject({ state: "offline", isCurrent: false });
  });

  it("fails safe when the selected profile does not exist, even with environment credentials", async () => {
    // The SDK skips environment credentials when AWS_PROFILE is set. The tool must not paper over it.
    const result = await cliRun(
      ["refresh", "--json"],
      awsEnv({ ...credentials, AWS_PROFILE: "missing" }),
    );
    expect(result.exitCode).toBe(0);
    expect(parse(result.stdout)).toMatchObject({
      isCurrent: false,
      snapshot: { accountId: null, profile: "missing" },
    });
  });

  it("reports missing credentials without crashing", async () => {
    const result = await cliRun(["refresh", "--json"], awsEnv({ AWS_REGION: "us-east-1" }));
    expect(result.exitCode).toBe(0);
    expect(parse(result.stdout)).toMatchObject({
      isCurrent: false,
      snapshot: { accountId: null },
    });
  });

  it("shows full details only for the explicit text status", async () => {
    await cliRun(["refresh"], awsEnv(credentials));
    const text = await cliRun(["status"], awsEnv());
    expect(text.stdout).toContain(ACCOUNT);
    expect(text.stdout).toContain("not authorization");
    expect(text.stdout.split("\n")[0]).not.toContain(ACCOUNT);
  });

  it("purges stored snapshots", async () => {
    await cliRun(["refresh"], awsEnv(credentials));
    const purged = await cliRun(["purge", "--json"], awsEnv());
    expect(parse(purged.stdout)).toEqual({ removed: 1 });
    expect(storedFiles()).toEqual([]);
  });

  it("rejects unknown commands and flags with exit code 2", async () => {
    expect((await cliRun(["switch", "prod"], awsEnv())).exitCode).toBe(2);
    expect((await cliRun(["status", "--profile", "x"], awsEnv())).exitCode).toBe(2);
    expect((await cliRun([], awsEnv())).exitCode).toBe(2);
  });

  it("shows configuration warnings for a hostile project file", async () => {
    writeFileSync(join(project, ".aws-context.json"), "{ not json");
    const result = await cliRun(["config", "show", "--json"], awsEnv());
    expect(parse(result.stdout).warnings).toHaveLength(1);
  });
});

describe.runIf(built)("SessionStart hook (bundled)", () => {
  it("adds masked context for the model and stores the snapshot", async () => {
    const [result] = await runPluginHooks(sessionStartInput(project), {
      pluginRoot,
      projectDir: project,
      env: awsEnv(credentials),
    });
    expect(result?.exitCode).toBe(0);
    expect(result?.secretFindings).toEqual([]);
    const context = (result?.json?.["hookSpecificOutput"] as { additionalContext: string })
      .additionalContext;
    expect(context).toContain("1234…9012");
    expect(context).not.toContain(ACCOUNT);
    expect(context).toContain("verified with STS");
    expect(context).toContain("not authorization");
    expect(storedFiles()).toHaveLength(1);
    assertNoSecrets(result?.stdout ?? "");
  });

  it("degrades to a non-current context without credentials, and still exits 0", async () => {
    const [result] = await runPluginHooks(sessionStartInput(project), {
      pluginRoot,
      projectDir: project,
      env: awsEnv(),
    });
    expect(result?.exitCode).toBe(0);
    const context = (result?.json?.["hookSpecificOutput"] as { additionalContext: string })
      .additionalContext;
    expect(context).toContain("NOT verified");
  });

  it("stays within its time budget when STS never answers", async () => {
    mode = "hang";
    const started = Date.now();
    const [result] = await runPluginHooks(sessionStartInput(project), {
      pluginRoot,
      projectDir: project,
      env: awsEnv(credentials),
      timeoutMs: 9_000,
    });
    expect(result?.timedOut).toBe(false);
    expect(result?.exitCode).toBe(0);
    expect(Date.now() - started).toBeLessThan(9_000);
    const context = (result?.json?.["hookSpecificOutput"] as { additionalContext: string })
      .additionalContext;
    expect(context).toContain("NOT verified");
  });
});

function mkdirConfig(content: object): void {
  const dir = join(home, ".claude", "aws-context");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify({ version: 1, ...content }));
}

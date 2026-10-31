import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { diagnose, synth } from "../src/lib/synth.js";
import { PATTERNS, planScaffold, writeScaffold } from "../src/lib/scaffold.js";
import { deps, FIXTURES, fakeDeployed, TEMPLATES } from "./helpers.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-infra-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const orders = join(FIXTURES, "cdk.out.orders");
const seed = (name: string, from: string): void => {
  mkdirSync(join(root, name), { recursive: true });
  cpSync(from, join(root, name), { recursive: true });
};
// The caller states the shape it expects from the CLI's JSON output.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const jsonOf = <T>(text: string): T => JSON.parse(text) as T;

describe("inspect", () => {
  it("reads a real cdk.out through its manifest, without running or contacting anything", async () => {
    seed("cdk.out", orders);
    const result = await runCli(["inspect"], deps(root));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Stack OrdersStack");
    expect(result.stdout).toContain("AWS::DynamoDB::Table");
    expect(result.stdout).toContain("DeletionPolicy Retain");
    expect(result.stdout).toMatch(/timeout 30s, memory 256 MB, tracing Active/);
    expect(result.stdout).toContain("nothing was run and AWS was not contacted");
  });

  it("reads one template file and emits JSON", async () => {
    writeFileSync(
      join(root, "t.template.json"),
      readFileSync(join(TEMPLATES, "flawed.v1.template.json")),
    );
    const parsed = jsonOf<{
      stacks: Array<{ name: string; inventory: { resourceCount: number } }>;
    }>((await runCli(["inspect", "t.template.json", "--json"], deps(root))).stdout);
    expect(parsed.stacks[0]?.name).toBe("t");
    expect(parsed.stacks[0]?.inventory.resourceCount).toBeGreaterThan(3);
  });

  it("explains what to do when there is nothing to read, and refuses paths outside the project", async () => {
    expect((await runCli(["inspect"], deps(root))).stdout).toContain("Run `synth` first");
    expect((await runCli(["inspect", "../outside"], deps(root))).stdout).toContain(
      "outside the project",
    );
    writeFileSync(join(root, "bad.json"), "{ nope");
    expect((await runCli(["inspect", "bad.json"], deps(root))).stdout).toContain("not valid JSON");
  });

  it("ignores a manifest that points outside its directory", async () => {
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out", "manifest.json"),
      JSON.stringify({
        artifacts: {
          Evil: {
            type: "aws:cloudformation:stack",
            properties: { templateFile: "../../etc/passwd" },
          },
        },
      }),
    );
    expect((await runCli(["inspect"], deps(root))).stdout).toContain("outside the directory");
  });
});

describe("review", () => {
  it("reports findings with evidence and a short summary first", async () => {
    seed("cdk.out", orders);
    const result = await runCli(["review"], deps(root));
    expect(result.stdout.indexOf("finding(s) in 1 stack(s)")).toBeGreaterThan(-1);
    expect(result.stdout).toContain("INFRA-NO-ALARMS");
    expect(result.stdout).toContain("Evidence: doc https://docs.aws.amazon.com/");
    const report = jsonOf<{
      plugin: string;
      mode: string;
      findings: Array<{ source: string; status: string }>;
    }>((await runCli(["review", "--json"], deps(root))).stdout);
    expect(report).toMatchObject({ plugin: "aws-infrastructure", mode: "local" });
    expect(
      report.findings.every(
        (finding) => finding.source === "static" && finding.status === "confirmed",
      ),
    ).toBe(true);
  });

  it("says nothing was reviewed when there are no templates", async () => {
    expect((await runCli(["review"], deps(root))).stdout).toContain("nothing was reviewed");
  });
});

describe("diff", () => {
  it("compares two directories or files and flags the stateful replacement", async () => {
    seed("before", orders);
    writeFileSync(
      join(root, "after.template.json"),
      readFileSync(join(TEMPLATES, "orders.v3-new-key.template.json")),
    );
    const result = await runCli(["diff", "before", "after.template.json"], deps(root));
    expect(result.stdout).toContain("template comparison only");
    expect(result.stdout).toContain("[?] POSSIBLE-REPLACE");
    expect(result.stdout).toContain("INFRA-DIFF-STATEFUL-REPLACE");
    const parsed = jsonOf<{ diff: { changes: unknown[] }; report: { findings: unknown[] } }>(
      (await runCli(["diff", "before", "after.template.json", "--json"], deps(root))).stdout,
    );
    expect(parsed.diff.changes.length).toBeGreaterThan(0);
    expect(parsed.report.findings.length).toBeGreaterThan(0);
  });

  it("refuses the change-set method and gives the command to run yourself", async () => {
    const result = await runCli(["diff", "a", "--method", "change-set"], deps(root));
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("cdk diff --method=change-set");
    expect(result.stdout).toContain("aws-guard will ask");
  });

  it("needs a baseline and reports missing templates", async () => {
    expect((await runCli(["diff"], deps(root))).exitCode).toBe(2);
    const result = await runCli(["diff", "nope", "alsonope"], deps(root));
    expect(result.stdout).toContain("Nothing to compare");
  });

  describe("--deployed", () => {
    const body = readFileSync(join(TEMPLATES, "orders.v1.template.json"), "utf8");

    it("reads the deployed template after confirming the account, and says so in the context", async () => {
      writeFileSync(
        join(root, "new.template.json"),
        readFileSync(join(TEMPLATES, "orders.v3-new-key.template.json")),
      );
      const { api, calls } = fakeDeployed(body);
      const result = await runCli(
        ["diff", "--deployed", "OrdersStack", "new.template.json", "--json"],
        deps(root, {
          deployedApi: () => api,
          contextEnvironment: () => ({
            accountId: "123456789012",
            environment: "production",
            profile: "prod",
          }),
        }),
      );
      const parsed = jsonOf<{
        diff: {
          baseline: string;
          context: { accountId: string; environment: string; identityVerified: boolean };
        };
        report: { mode: string };
      }>(result.stdout);
      expect(parsed.diff.baseline).toContain(
        "deployed template of OrdersStack (account 123456789012",
      );
      expect(parsed.diff.context).toMatchObject({
        accountId: "123456789012",
        environment: "production",
        identityVerified: true,
      });
      expect(parsed.report.mode).toBe("read-only-cloud");
      expect(calls).toEqual(["getTemplate:OrdersStack", "close"]);
    });

    it("does not adopt an environment recorded for a different account", async () => {
      writeFileSync(join(root, "new.template.json"), body);
      const { api } = fakeDeployed(body);
      const parsed = jsonOf<{ diff: { context: { environment: string } } }>(
        (
          await runCli(
            ["diff", "--deployed", "S", "new.template.json", "--json"],
            deps(root, {
              deployedApi: () => api,
              contextEnvironment: () => ({
                accountId: "999999999999",
                environment: "production",
                profile: null,
              }),
            }),
          )
        ).stdout,
      );
      expect(parsed.diff.context.environment).toBe("unknown");
    });

    it.each([
      [
        "AccessDenied",
        "User x is not authorized to perform: cloudformation:GetTemplate on resource y",
        "Missing permission: cloudformation:GetTemplate",
      ],
      ["ValidationError", "Stack with id Nope does not exist", "does not exist in this account"],
      ["ExpiredToken", "expired", "session expired"],
    ])("reports %s plainly", async (name, message, expected) => {
      const error = Object.assign(new Error(message), { name });
      const result = await runCli(
        ["diff", "--deployed", "S"],
        deps(root, { deployedApi: () => fakeDeployed(error).api }),
      );
      expect(result.stdout).toContain(expected);
      expect(result.stdout).not.toContain("on resource y");
    });

    it("reports a YAML or unreadable deployed template, and a missing region", async () => {
      expect(
        (
          await runCli(
            ["diff", "--deployed", "S"],
            deps(root, { deployedApi: () => fakeDeployed("Resources:\n  A:").api }),
          )
        ).stdout,
      ).toContain("could not be read");
      expect(
        (
          await runCli(
            ["diff", "--deployed", "S"],
            deps(root, { sdkRegion: () => Promise.resolve(null) }),
          )
        ).stdout,
      ).toContain("No region is set");
      expect(
        (await runCli(["diff", "--deployed", "S", "--region", "not a region"], deps(root)))
          .exitCode,
      ).toBe(2);
    });
  });
});

describe("scaffold", () => {
  it("lists the files and writes nothing without --write", async () => {
    const result = await runCli(["scaffold", "queue-lambda-dynamodb", "Orders"], deps(root));
    expect(result.stdout).toContain("lib/orders-stack.ts");
    expect(result.stdout).toContain("nothing was written");
    expect(existsSync(join(root, "lib"))).toBe(false);
  });

  it("writes the files, never overwrites, and stays inside the project", async () => {
    const first = await runCli(["scaffold", "http-api-cognito", "Portal", "--write"], deps(root));
    expect(first.stdout).toContain("Created lib/portal-stack.ts");
    const content = readFileSync(join(root, "lib", "portal-stack.ts"), "utf8");
    expect(content).toContain("class PortalStack");
    const second = await runCli(["scaffold", "http-api-cognito", "Portal", "--write"], deps(root));
    expect(second.stdout).toContain("Skipped lib/portal-stack.ts");
    expect(readFileSync(join(root, "lib", "portal-stack.ts"), "utf8")).toBe(content);
    expect(writeScaffold(root, [{ path: "../escape.ts", content: "x" }]).skipped).toEqual([
      "../escape.ts",
    ]);
  });

  it("rejects unknown patterns and unsafe names", async () => {
    expect((await runCli(["scaffold", "nope", "Orders"], deps(root))).exitCode).toBe(2);
    expect((await runCli(["scaffold", "s3-sqs-lambda", "bad name; rm"], deps(root))).exitCode).toBe(
      2,
    );
    expect(planScaffold("s3-sqs-lambda", "../x")).toHaveProperty("error");
  });

  it("generates valid TypeScript for every pattern, with the secure defaults", () => {
    for (const pattern of PATTERNS) {
      const plan = planScaffold(pattern, "Demo");
      if ("error" in plan) throw new Error(plan.error);
      const stack = plan.files.find((file) => file.path.startsWith("lib/"))?.content ?? "";
      expect(stack).toContain("class DemoStack");
      expect(stack).not.toContain("RemovalPolicy.DESTROY");
      expect(stack).not.toContain('allowOrigins: ["*"]');
      expect(stack).toContain("Tracing.ACTIVE");
    }
  });
});

describe("synth", () => {
  const posixOnly = process.platform === "win32";
  const noRun = () => Promise.reject(new Error("must not run"));

  it("explains each setup problem before running anything", async () => {
    expect((await synth({ root, env: {}, run: noRun })).diagnostic?.code).toBe("NO_APP");
    writeFileSync(join(root, "cdk.json"), "{}");
    expect((await synth({ root, env: { PATH: "" }, run: noRun })).diagnostic?.code).toBe("NO_CDK");
    expect((await synth({ root, env: {}, out: "../elsewhere", run: noRun })).diagnostic?.code).toBe(
      "UNSAFE_PATH",
    );
    expect(
      (await synth({ root, env: {}, stacks: ["bad name!"], run: noRun })).diagnostic?.code,
    ).toBe("INVALID_INPUT");
  });

  function installFakeCdk(script: string): void {
    const pkg = join(root, "node_modules", "aws-cdk");
    mkdirSync(join(pkg, "bin"), { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "aws-cdk", bin: { cdk: "bin/cdk" } }),
    );
    writeFileSync(join(pkg, "bin", "cdk"), script);
    chmodSync(join(pkg, "bin", "cdk"), 0o755);
    writeFileSync(join(root, "cdk.json"), '{"app":"node app.js"}');
  }

  it.skipIf(posixOnly)(
    "runs the project's aws-cdk with node, no AWS variables, a private HOME, and --no-lookups",
    async () => {
      installFakeCdk(`
const fs = require("fs"); const path = require("path");
const out = process.argv[process.argv.indexOf("--output") + 1];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "Fake.template.json"), JSON.stringify({ Resources: { Q: { Type: "AWS::SQS::Queue", Properties: {} } } }));
fs.writeFileSync(path.join(out, "seen.json"), JSON.stringify({ args: process.argv.slice(2), aws: Object.keys(process.env).filter((k) => k.startsWith("AWS")).sort(), home: process.env.HOME, secret: process.env.SECRET_TOKEN ?? null }));
`);
      const env = {
        PATH: process.env["PATH"],
        HOME: "/real/home",
        AWS_PROFILE: "prod",
        AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
        SECRET_TOKEN: "t",
      };
      const result = await runCli(["synth"], deps(root, { env }));
      expect(result.stdout).toContain("without AWS credentials (no lookups)");
      expect(result.stdout).toContain("Stack Fake");
      const seen = jsonOf<{ args: string[]; aws: string[]; home: string; secret: string | null }>(
        readFileSync(join(root, "cdk.out", "seen.json"), "utf8"),
      );
      expect(seen.args).toEqual(
        expect.arrayContaining(["synth", "--no-lookups", "--quiet", "--no-version-reporting"]),
      );
      expect(seen.aws.sort()).toEqual([
        "AWS_CONFIG_FILE",
        "AWS_EC2_METADATA_DISABLED",
        "AWS_SHARED_CREDENTIALS_FILE",
      ]);
      expect(seen.home).not.toBe("/real/home");
      expect(seen.secret).toBeNull();
      expect(existsSync(seen.home)).toBe(false);
    },
  );

  it.skipIf(posixOnly)("passes AWS variables only with --lookups, and says so", async () => {
    installFakeCdk(`
const fs = require("fs");
const out = process.argv[process.argv.indexOf("--output") + 1];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + "/Fake.template.json", JSON.stringify({ Resources: { Q: { Type: "AWS::SQS::Queue", Properties: {} } } }));
fs.writeFileSync(out + "/seen.json", JSON.stringify({ args: process.argv.slice(2), profile: process.env.AWS_PROFILE ?? null }));
`);
    const result = await runCli(
      ["synth", "--lookups"],
      deps(root, { env: { PATH: process.env["PATH"], AWS_PROFILE: "dev" } }),
    );
    expect(result.stdout).toContain("with your AWS credentials (lookups allowed)");
    const seen = jsonOf<{ args: string[]; profile: string | null }>(
      readFileSync(join(root, "cdk.out", "seen.json"), "utf8"),
    );
    expect(seen.profile).toBe("dev");
    expect(seen.args).not.toContain("--no-lookups");
  });

  it.skipIf(posixOnly)(
    "turns a failing app into a diagnostic with a redacted excerpt",
    async () => {
      installFakeCdk(
        `console.error("Error: Cannot find module 'left-pad'\\nAWS_SECRET_ACCESS_KEY=hunter2hunter2"); process.exit(1);`,
      );
      const result = await runCli(["synth"], deps(root));
      expect(result.stdout).toContain("Synth failed: MISSING_DEPENDENCY");
      expect(result.stdout).toContain("Install the project's dependencies");
      expect(result.stdout).not.toContain("hunter2hunter2");
    },
  );

  it.skipIf(posixOnly)("stops an app that never finishes", async () => {
    installFakeCdk(`setInterval(() => {}, 1000);`);
    const result = await synth({ root, env: { PATH: process.env["PATH"] }, timeoutMs: 500 });
    expect(result.diagnostic?.code).toBe("TIMEOUT");
  });
});

describe("diagnose", () => {
  const fail = (stderr: string) =>
    diagnose({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr,
      stdoutTruncated: false,
      stderrTruncated: false,
      timedOut: false,
      durationMs: 1,
      spawnError: null,
    });
  it.each([
    ["Unable to resolve AWS account to use", "NEEDS_LOOKUP"],
    ["src/app.ts(3,1): error TS2307: Cannot find name 'x'", "TYPESCRIPT_ERROR"],
    ["--app is required", "NO_APP"],
    ["Error: Circular dependency between stacks", "CYCLE"],
    ["Error: boom at Stack", "APP_ERROR"],
    ["something else entirely", "APP_ERROR"],
  ])("recognizes %s", (text, code) => {
    expect(fail(text).code).toBe(code);
  });
});

describe("usage", () => {
  it("prints usage for unknown commands and options, and offers no deploy verb", async () => {
    for (const argv of [
      [],
      ["deploy"],
      ["inspect", "--bogus"],
      ["inspect", "a", "b", "c"],
      ["synth", "x"],
    ]) {
      expect((await runCli(argv, deps(root))).exitCode).toBe(2);
    }
    expect((await runCli(["deploy"], deps(root))).stdout).toContain("Nothing here deploys");
  });
});

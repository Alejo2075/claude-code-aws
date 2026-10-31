import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, describe, expect, it } from "vitest";

import { type CliDeps, runCli } from "../src/lib/cli.js";
import { pipelineFiles, validatePipeline } from "../src/lib/pipeline.js";
import {
  broadeningChanges,
  confirmationFor,
  gateProblems,
  loadPlan,
  planDir,
  prunePlans,
  templateHash,
} from "../src/lib/plan.js";
import { adviseRollback } from "../src/lib/rollback.js";
import { ACCOUNT, deps, fakeApi, fixtureTemplate, NOW, sandbox, type Sandbox } from "./helpers.js";

const boxes: Sandbox[] = [];
afterEach(() => {
  for (const box of boxes.splice(0)) {
    rmSync(box.root, { recursive: true, force: true });
    rmSync(box.config, { recursive: true, force: true });
  }
});
const setup = (app = "orders.v1") => {
  const made = sandbox(app);
  boxes.push(made.box);
  return made;
};
const template = (name: string) => {
  const parsed = parseTemplate(fixtureTemplate(name));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.template;
};
const jsonOf = (text: string): Record<string, unknown> =>
  JSON.parse(text) as Record<string, unknown>;
const planIdOf = (text: string): string => /Plan ([0-9a-f]{16}) saved/.exec(text)?.[1] ?? "";

describe("plan, hashing and gates", () => {
  it("hashes a template by content, not by key order or whitespace", () => {
    const a = parseTemplate('{"Resources":{"A":{"Type":"X::Y::Z","Properties":{"b":1,"a":2}}}}');
    const b = parseTemplate(
      '{ "Resources": { "A": { "Properties": { "a": 2, "b": 1 }, "Type": "X::Y::Z" } } }',
    );
    if (!a.ok || !b.ok) throw new Error("parse");
    expect(templateHash(a.template)).toBe(templateHash(b.template));
    expect(templateHash(a.template)).not.toBe(templateHash(template("orders.v1")));
  });

  it("finds permission changes against the deployed template, and none when nothing is new", () => {
    expect(broadeningChanges(template("orders.v1"), template("orders.v1"))).toEqual([]);
    const added = broadeningChanges(template("orders.v1"), template("flawed.v1"));
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((item) => item.summary.includes("*"))).toBe(true);
    // A brand-new stack lists only statements that are broad on their face.
    expect(broadeningChanges(null, template("orders.v1"))).toEqual([]);
    expect(broadeningChanges(null, template("flawed.v1")).length).toBeGreaterThan(0);
  });

  it("round-trips a plan, expires it, and rejects tampering or the wrong project", async () => {
    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi();
    const saved = await runCli(["plan"], deps(box, { synthRun, execRun }, api));
    const id = planIdOf(saved.stdout);
    expect(id).not.toBe("");
    const file = join(planDir(box.config, "65d80d2c48b3d23b"), `${id}.json`);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o077).toBe(0);
    expect(loadPlan(box.config, "65d80d2c48b3d23b", id, NOW).ok).toBe(true);
    const old = loadPlan(
      box.config,
      "65d80d2c48b3d23b",
      id,
      new Date(NOW.getTime() + 2 * 3600_000),
    );
    expect(old.ok).toBe(false);
    expect(old.ok ? "" : old.reason).toContain("expired");
    expect(loadPlan(box.config, "ffffffffffffffff", id, NOW).ok).toBe(false);
    expect(loadPlan(box.config, "65d80d2c48b3d23b", "../../etc/passwd", NOW).ok).toBe(false);
    writeFileSync(
      file,
      JSON.stringify({ ...jsonOf(readFileSync(file, "utf8")), id: "0000000000000000" }),
    );
    expect(loadPlan(box.config, "65d80d2c48b3d23b", id, NOW).ok).toBe(false);
    writeFileSync(file, "{ broken");
    const broken = loadPlan(box.config, "65d80d2c48b3d23b", id, NOW);
    expect(broken.ok).toBe(false);
    expect(broken.ok ? "" : broken.reason).toContain("damaged");
    expect(prunePlans(box.config, "65d80d2c48b3d23b", new Date(NOW.getTime() + 2 * 3600_000))).toBe(
      1,
    );
    expect(readdirSync(planDir(box.config, "65d80d2c48b3d23b"))).toEqual([]);
  });

  it("lists every unmet condition at once", () => {
    const plan = {
      schemaVersion: "1" as const,
      id: "0123456789abcdef",
      createdAt: NOW.toISOString(),
      expiresAt: NOW.toISOString(),
      workspaceId: "w",
      accountId: ACCOUNT,
      region: "us-east-1",
      environment: "production" as const,
      stacks: [{ name: "A", templateSha256: "aa" }],
      counts: { create: 0, update: 0, replace: 1, possibleReplace: 0, delete: 0, unknown: 0 },
      destructive: [
        { logicalId: "A/Table", resourceType: "AWS::DynamoDB::Table", action: "replace", why: "x" },
      ],
      broadening: [{ id: "A/Role#0", owner: "A/Role", summary: "allows *" }],
    };
    const problems = gateProblems({
      plan,
      identity: { accountId: "999999999999" },
      region: "eu-west-1",
      currentHashes: new Map([
        ["A", "bb"],
        ["B", "cc"],
      ]),
      confirm: null,
      acceptDestructive: [],
      acceptSecurityChanges: false,
    });
    expect(problems.join("\n")).toContain("not the planned one (plan: 123456789012)");
    expect(problems.join("\n")).toContain("not the planned one (plan: us-east-1)");
    expect(problems.join("\n")).toContain("changed since it was reviewed");
    expect(problems.join("\n")).toContain("Stack B was not in the plan");
    expect(problems.join("\n")).toContain(`--confirm ${ACCOUNT}:us-east-1:A`);
    expect(problems.join("\n")).toContain("--accept-destructive A/Table");
    expect(problems.join("\n")).toContain("--accept-security-changes");
    const satisfied = gateProblems({
      plan,
      identity: { accountId: ACCOUNT },
      region: "us-east-1",
      currentHashes: new Map([["A", "aa"]]),
      confirm: confirmationFor(plan),
      acceptDestructive: ["A/Table"],
      acceptSecurityChanges: true,
    });
    expect(satisfied).toEqual([]);
  });
});

describe("preflight and plan", () => {
  it("reviews a new stack read-only and never deploys", async () => {
    const { box, synthRun, execRun } = setup();
    const { api, state } = fakeApi();
    const result = await runCli(["preflight"], deps(box, { synthRun, execRun }, api));
    expect(result.stdout).toContain("✔ Identity");
    expect(result.stdout).toContain("✔ Bootstrap");
    expect(result.stdout).toContain("new stack(s): OrdersStack");
    expect(result.stdout).toContain("- Other checks: Not checked here: tests");
    expect(result.stdout).toContain("No plan was saved");
    expect(box.execCalls).toEqual([]);
    expect(state.calls).toContain("getTemplate:OrdersStack");
    expect(box.synthCalls[0]?.env["AWS_PROFILE"]).toBeUndefined();
    expect(box.synthCalls[0]?.args).toContain("--no-lookups");
  });

  it("warns that the environment is unclassified and requires confirmation in the plan", async () => {
    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi();
    const result = await runCli(
      ["plan"],
      deps(box, { synthRun, execRun }, api, { known: () => null }),
    );
    expect(result.stdout).toContain("treated as unclassified");
    expect(result.stdout).toContain(`--confirm ${ACCOUNT}:us-east-1:OrdersStack`);
  });

  it("flags destructive and permission changes against the deployed template", async () => {
    const { box, synthRun, execRun } = setup("orders.v3-new-key");
    const { api } = fakeApi({
      stacks: {
        CDKToolkit: {
          name: "CDKToolkit",
          status: "CREATE_COMPLETE",
          reason: null,
          terminationProtection: false,
        },
        OrdersStack: {
          name: "OrdersStack",
          status: "UPDATE_COMPLETE",
          reason: null,
          terminationProtection: false,
        },
      },
      deployed: { OrdersStack: fixtureTemplate("orders.v1") },
    });
    const result = await runCli(["plan"], deps(box, { synthRun, execRun }, api));
    expect(result.stdout).toContain("! Destructive changes");
    expect(result.stdout).toContain("possible-replace OrdersStack/");
    expect(result.stdout).toContain("--accept-destructive OrdersStack/");
    expect(result.stdout).toContain("Nothing has been deployed");
  });

  it.each([
    [
      "an identity failure",
      { identity: Object.assign(new Error("x"), { name: "ExpiredToken" }) },
      "credentials expired",
    ],
    [
      "an unreadable deployed template",
      { deployed: { OrdersStack: "Resources:\n  A:" } },
      "could not be read",
    ],
  ])("blocks on %s without making a plan", async (_name, overrides, text) => {
    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi(overrides);
    const result = await runCli(["plan"], deps(box, { synthRun, execRun }, api));
    expect(result.stdout).toContain("Blocked");
    expect(result.stdout.toLowerCase()).toContain(text);
    expect(existsSync(planDir(box.config, "65d80d2c48b3d23b"))).toBe(false);
  });

  it("blocks when synthesis fails and warns when the account is not bootstrapped", async () => {
    const { box, execRun } = setup();
    const { api } = fakeApi({ stacks: { CDKToolkit: null, OrdersStack: null } });
    const failing = (): ReturnType<NonNullable<CliDeps["synthRun"]>> => {
      return Promise.resolve({
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "Cannot find module 'x'",
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false,
        durationMs: 1,
        spawnError: null,
      });
    };
    const result = await runCli(["plan"], deps(box, { synthRun: failing, execRun }, api));
    expect(result.stdout).toContain("! Bootstrap: No CDKToolkit stack");
    expect(result.stdout).toContain("✖ Synth: MISSING_DEPENDENCY");
  });
});

describe("deploy", () => {
  async function planned(
    app: string,
    extra: { deployed?: string; known?: ReturnType<typeof deps>["known"] } = {},
  ) {
    const { box, synthRun, execRun } = setup(app);
    const stacks =
      extra.deployed === undefined
        ? undefined
        : {
            CDKToolkit: {
              name: "CDKToolkit",
              status: "CREATE_COMPLETE",
              reason: null,
              terminationProtection: false,
            },
            OrdersStack: {
              name: "OrdersStack",
              status: "UPDATE_COMPLETE",
              reason: null,
              terminationProtection: false,
            },
          };
    const { api, state } = fakeApi({
      ...(stacks === undefined ? {} : { stacks }),
      deployed: { OrdersStack: extra.deployed ?? null },
    });
    const make = () =>
      deps(
        box,
        { synthRun, execRun },
        api,
        extra.known === undefined ? {} : { known: extra.known },
      );
    const result = await runCli(["plan"], make());
    // From here on the stack "exists": what a successful deployment would leave behind.
    state.stacks["OrdersStack"] = {
      name: "OrdersStack",
      status: "UPDATE_COMPLETE",
      reason: null,
      terminationProtection: false,
    };
    return { box, api, state, make, id: planIdOf(result.stdout), synthRun, execRun };
  }

  it("deploys exactly the reviewed assembly: from cdk.out, exclusively, never with hotswap, with the user's credentials", async () => {
    const { box, make, id } = await planned("orders.v1");
    const done = await runCli(["deploy", id], make());
    expect(done.stdout).toContain("Deployed.");
    expect(box.execCalls).toHaveLength(1);
    const exec = box.execCalls[0];
    expect(exec?.args).toEqual(
      expect.arrayContaining([
        "deploy",
        "--app",
        "cdk.out",
        "--exclusively",
        "--require-approval",
        "never",
        "OrdersStack",
      ]),
    );
    expect(exec?.args.join(" ")).not.toContain("hotswap");
    expect(exec?.env["AWS_PROFILE"]).toBe("dev");
    expect(done.stdout).not.toContain("hunter2hunter2");
  });

  it("describes a failed deployment honestly, with the stack status", async () => {
    const { box, make, id, state } = await planned("orders.v1");
    state.stacks["OrdersStack"] = {
      name: "OrdersStack",
      status: "UPDATE_ROLLBACK_COMPLETE",
      reason: "boom",
      terminationProtection: false,
    };
    const done = await runCli(["deploy", id], make());
    expect(done.exitCode).toBe(1);
    expect(done.stdout).toContain("did not complete cleanly");
    expect(done.stdout).toContain("UPDATE_ROLLBACK_COMPLETE (boom)");
    expect(done.stdout).toContain("`rollback`");
    expect(box.execCalls).toHaveLength(1);
  });

  it("refuses production or unclassified targets until the confirmation names the target", async () => {
    const { box, make, id } = await planned("orders.v1", {
      known: () => ({ accountId: ACCOUNT, environment: "production" }),
    });
    const without = await runCli(["deploy", id], make());
    expect(without).toMatchObject({ exitCode: 1 });
    expect(without.stdout).toContain(`--confirm ${ACCOUNT}:us-east-1:OrdersStack`);
    expect(
      (await runCli(["deploy", id, "--confirm", `${ACCOUNT}:us-east-1:Other`], make())).exitCode,
    ).toBe(1);
    expect(box.execCalls).toEqual([]);
    expect(
      (await runCli(["deploy", id, "--confirm", `${ACCOUNT}:us-east-1:OrdersStack`], make()))
        .stdout,
    ).toContain("Deployed.");
  });

  it("refuses destructive and permission changes until each is acknowledged", async () => {
    const { box, make, id } = await planned("orders.v3-new-key", {
      deployed: fixtureTemplate("orders.v1"),
    });
    const refused = await runCli(["deploy", id], make());
    expect(refused.stdout).toContain("Destructive change not acknowledged");
    const logical = /--accept-destructive (OrdersStack\/\S+)\./.exec(refused.stdout)?.[1] ?? "";
    expect(logical).not.toBe("");
    expect(box.execCalls).toEqual([]);
    expect(
      (await runCli(["deploy", id, "--accept-destructive", logical], make())).stdout,
    ).toContain("Deployed.");
  });

  it("refuses permission-broadening changes without --accept-security-changes", async () => {
    const { box, make, id } = await planned("flawed.v1", {
      deployed: fixtureTemplate("orders.v1"),
    });
    const refused = await runCli(["deploy", id, "--accept-destructive", "OrdersStack/x"], make());
    expect(refused.stdout).toContain("broaden permissions");
    expect(box.execCalls).toEqual([]);
  });

  it("refuses when the app changed after the review, when the plan is old, and when the account is different", async () => {
    const { box, make, id } = await planned("orders.v1");
    box.setApp("orders.v3-new-key");
    const tampered = await runCli(["deploy", id], make());
    expect(tampered.stdout).toContain("changed since it was reviewed");
    box.setApp("orders.v1");
    const late = await runCli(["deploy", id], {
      ...make(),
      now: new Date(NOW.getTime() + 2 * 3600_000),
    });
    expect(late.stdout).toContain("expired");
    const other = fakeApi({
      identity: { accountId: "999999999999", arn: "arn:aws:sts::999999999999:assumed-role/X/y" },
    }).api;
    const wrong = await runCli(["deploy", id], { ...make(), api: () => other });
    expect(wrong.stdout).toContain("not the planned one");
    expect((await runCli(["deploy", id, "--region", "eu-west-1"], make())).stdout).toContain(
      "not the planned region",
    );
    expect(box.execCalls).toEqual([]);
  });

  it("refuses an unknown plan and a failed identity check", async () => {
    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi();
    expect(
      (await runCli(["deploy", "0123456789abcdef"], deps(box, { synthRun, execRun }, api))).stdout,
    ).toContain("There is no such plan");
    const made = await planned("orders.v1");
    const broken = fakeApi({ identity: new Error("x") }).api;
    expect(
      (await runCli(["deploy", made.id], { ...made.make(), api: () => broken })).stdout,
    ).toContain("identity could not be verified");
    expect(made.box.execCalls).toEqual([]);
  });

  it("does not deploy when the CDK command line is not installed", async () => {
    const made = await planned("orders.v1");
    rmSync(join(made.box.root, "node_modules"), { recursive: true });
    const result = await runCli(["deploy", made.id], {
      ...made.make(),
      execRun: undefined as never,
    });
    expect(result.exitCode).toBe(1);
  });
});

describe("status, rollback, pipeline", () => {
  it("shows status and events, failures marked", async () => {
    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi({
      stacks: {
        OrdersStack: {
          name: "OrdersStack",
          status: "UPDATE_ROLLBACK_FAILED",
          reason: "r",
          terminationProtection: true,
        },
      },
      events: [
        { at: "2026-01-01T00:00:00.000Z", logicalId: "Fn", status: "UPDATE_FAILED", reason: "bad" },
      ],
    });
    const result = await runCli(["status", "OrdersStack"], deps(box, { synthRun, execRun }, api));
    expect(result.stdout).toContain("UPDATE_ROLLBACK_FAILED (r); termination protection on");
    expect(result.stdout).toContain("! UPDATE_FAILED");
    expect(
      (await runCli(["status", "Nope"], deps(box, { synthRun, execRun }, api))).stdout,
    ).toContain("does not exist");
  });

  it("explains rollback options, runs nothing, and lists what cannot be undone", async () => {
    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi({
      stacks: {
        OrdersStack: {
          name: "OrdersStack",
          status: "UPDATE_ROLLBACK_FAILED",
          reason: "x",
          terminationProtection: false,
        },
      },
      deployed: { OrdersStack: fixtureTemplate("orders.v1") },
    });
    const result = await runCli(["rollback", "OrdersStack"], deps(box, { synthRun, execRun }, api));
    expect(result.stdout).toContain(
      "aws cloudformation continue-update-rollback --stack-name OrdersStack",
    );
    expect(result.stdout).toContain("this plugin does not run them");
    expect(result.stdout).toContain("Not reversible by redeploying");
    expect(box.execCalls).toEqual([]);
  });

  it.each([
    ["UPDATE_COMPLETE", "not undone by a command"],
    ["UPDATE_ROLLBACK_COMPLETE", "nothing to undo"],
    ["ROLLBACK_COMPLETE", "cannot be updated, only deleted"],
    ["UPDATE_IN_PROGRESS", "in progress"],
    ["DELETE_FAILED", "could not remove"],
    ["SOMETHING_ELSE", "no advice"],
  ])("advises on %s", (status, text) => {
    expect(adviseRollback("S", status, null, []).summary.toLowerCase()).toContain(
      text.toLowerCase(),
    );
  });

  it("generates an OIDC pipeline with no keys and only the bootstrap roles, validates input, and never overwrites", async () => {
    const input = {
      account: ACCOUNT,
      region: "us-east-1",
      repo: "Alejo2075/app",
      environment: "production",
      branch: "main",
      qualifier: "hnb659fds",
    };
    expect(validatePipeline(input)).toBeNull();
    for (const bad of [
      { account: "12" },
      { region: "nowhere" },
      { repo: "no-slash" },
      { environment: "a b" },
      { branch: "x; rm" },
      { qualifier: "UP" },
    ]) {
      expect(validatePipeline({ ...input, ...bad })).not.toBeNull();
    }
    const files = pipelineFiles(input);
    const workflow = files.find((f) => f.path.endsWith("deploy.yml"))?.content ?? "";
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("--require-approval broadening");
    expect(workflow).not.toMatch(/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|secrets\./);
    expect(workflow).toMatch(/uses: [\w./-]+@[0-9a-f]{40}/);
    const policy = JSON.parse(
      files.find((f) => f.path.endsWith("policy.json"))?.content ?? "{}",
    ) as { Statement: Array<{ Action: string; Resource: string[] }> };
    expect(policy.Statement[0]?.Action).toBe("sts:AssumeRole");
    expect(policy.Statement[0]?.Resource).toHaveLength(4);
    expect(
      policy.Statement[0]?.Resource.every(
        (r) => r.includes(`cdk-hnb659fds-`) && r.includes(ACCOUNT),
      ),
    ).toBe(true);
    const trust = files.find((f) => f.path.endsWith("trust.json"))?.content ?? "";
    expect(trust).toContain("repo:Alejo2075/app:environment:production");

    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi();
    const args = [
      "pipeline",
      "--account",
      ACCOUNT,
      "--region",
      "us-east-1",
      "--repo",
      "Alejo2075/app",
      "--environment",
      "production",
    ];
    const dry = await runCli(args, deps(box, { synthRun, execRun }, api));
    expect(dry.stdout).toContain("nothing was written");
    expect(existsSync(join(box.root, ".github"))).toBe(false);
    expect(
      (await runCli([...args, "--write"], deps(box, { synthRun, execRun }, api))).stdout,
    ).toContain("Created .github/workflows/deploy.yml");
    expect(
      (await runCli([...args, "--write"], deps(box, { synthRun, execRun }, api))).stdout,
    ).toContain("Skipped .github/workflows/deploy.yml");
    expect(
      (await runCli(["pipeline", "--account", "x"], deps(box, { synthRun, execRun }, api)))
        .exitCode,
    ).toBe(2);
  });

  it("rejects unknown commands and options", async () => {
    const { box, synthRun, execRun } = setup();
    const { api } = fakeApi();
    for (const argv of [
      [],
      ["destroy"],
      ["plan", "--bogus"],
      ["deploy"],
      ["status"],
      ["plan", "x"],
      ["plan", "--region", "nope"],
    ]) {
      expect((await runCli(argv, deps(box, { synthRun, execRun }, api))).exitCode).toBe(2);
    }
  });
});

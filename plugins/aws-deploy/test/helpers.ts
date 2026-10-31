import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunOptions, RunResult } from "@claude-code-aws/tool-runner";

import type { DeployApi, EventLine, StackState } from "../src/lib/aws.js";
import type { CliDeps } from "../src/lib/cli.js";

export const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "serverless",
);
export const ACCOUNT = "123456789012";
export const NOW = new Date("2026-10-31T12:00:00Z");

export const fixtureTemplate = (name: string): string =>
  readFileSync(join(FIXTURES, "templates", `${name}.template.json`), "utf8");

export interface Sandbox {
  root: string;
  config: string;
  /** Replaces what the next synthesis writes into cdk.out. */
  setApp: (templateName: string) => void;
  synthCalls: RunOptions[];
  execCalls: RunOptions[];
}

/** A project directory with a cdk.json and a fake aws-cdk. The runners write fixtures instead of running CDK. */
export function sandbox(initialApp = "orders.v1"): {
  box: Sandbox;
  synthRun: CliDeps["synthRun"];
  execRun: CliDeps["execRun"];
} {
  const root = mkdtempSync(join(tmpdir(), "aws-deploy-project-"));
  const config = mkdtempSync(join(tmpdir(), "aws-deploy-config-"));
  writeFileSync(join(root, "cdk.json"), '{"app":"node app.js"}');
  mkdirSync(join(root, "node_modules", "aws-cdk", "bin"), { recursive: true });
  writeFileSync(
    join(root, "node_modules", "aws-cdk", "package.json"),
    JSON.stringify({ name: "aws-cdk", bin: { cdk: "bin/cdk" } }),
  );
  writeFileSync(join(root, "node_modules", "aws-cdk", "bin", "cdk"), "");
  chmodSync(join(root, "node_modules", "aws-cdk", "bin", "cdk"), 0o755);
  let app = initialApp;
  const box: Sandbox = {
    root,
    config,
    setApp: (name) => (app = name),
    synthCalls: [],
    execCalls: [],
  };
  const ok = (): RunResult => ({
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    durationMs: 5,
    spawnError: null,
  });
  return {
    box,
    synthRun: (options) => {
      box.synthCalls.push(options);
      mkdirSync(join(root, "cdk.out"), { recursive: true });
      writeFileSync(join(root, "cdk.out", "OrdersStack.template.json"), fixtureTemplate(app));
      return Promise.resolve(ok());
    },
    execRun: (options) => {
      box.execCalls.push(options);
      return Promise.resolve({
        ...ok(),
        stdout:
          "OrdersStack: deploying...\n✅  OrdersStack\nAWS_SECRET_ACCESS_KEY=hunter2hunter2\n",
      });
    },
  };
}

export interface FakeState {
  identity: { accountId: string; arn: string } | Error;
  stacks: Record<string, StackState | null>;
  deployed: Record<string, string | null>;
  events: EventLine[];
  calls: string[];
}

export function fakeApi(overrides: Partial<FakeState> = {}): { api: DeployApi; state: FakeState } {
  const state: FakeState = {
    identity: { accountId: ACCOUNT, arn: `arn:aws:sts::${ACCOUNT}:assumed-role/Dev/carol` },
    stacks: {
      CDKToolkit: {
        name: "CDKToolkit",
        status: "CREATE_COMPLETE",
        reason: null,
        terminationProtection: false,
      },
      OrdersStack: null,
    },
    deployed: { OrdersStack: null },
    events: [],
    calls: [],
    ...overrides,
  };
  const api: DeployApi = {
    identity: () =>
      state.identity instanceof Error
        ? Promise.reject(state.identity)
        : Promise.resolve(state.identity),
    describeStack: (name) => {
      state.calls.push(`describeStack:${name}`);
      return Promise.resolve(state.stacks[name] ?? null);
    },
    getTemplate: (name) => {
      state.calls.push(`getTemplate:${name}`);
      return Promise.resolve(state.deployed[name] ?? null);
    },
    events: () => Promise.resolve(state.events),
    close: () => {
      state.calls.push("close");
    },
  };
  return { api, state };
}

export function deps(
  box: Sandbox,
  runners: { synthRun: CliDeps["synthRun"]; execRun: CliDeps["execRun"] },
  api: DeployApi,
  overrides: Partial<CliDeps> = {},
): CliDeps {
  return {
    root: box.root,
    env: { PATH: process.env["PATH"], AWS_PROFILE: "dev" },
    configDir: box.config,
    workspaceId: "65d80d2c48b3d23b",
    api: () => api,
    sdkRegion: () => Promise.resolve("us-east-1"),
    fallbackRegion: null,
    known: () => ({ accountId: ACCOUNT, environment: "non-production" }),
    ...(runners.synthRun === undefined ? {} : { synthRun: runners.synthRun }),
    ...(runners.execRun === undefined ? {} : { execRun: runners.execRun }),
    now: NOW,
    ...overrides,
  };
}

export { cpSync };

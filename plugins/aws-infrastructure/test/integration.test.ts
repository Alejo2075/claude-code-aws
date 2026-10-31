// Runs the bundled CLI the way a user does. `--deployed` talks to fake STS and CloudFormation
// endpoints on loopback. No AWS account and no network beyond 127.0.0.1. Requires `pnpm build`.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findSecretLikeStrings } from "@claude-code-aws/testkit";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runProcess } from "../../../packages/testkit/src/run-hook.js";
import { FIXTURES, TEMPLATES } from "./helpers.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.mjs");
const built = existsSync(cli);
const ACCOUNT = "123456789012";
const KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const ALLOWED = new Set(["GetCallerIdentity", "GetTemplate"]);

let server: Server;
let endpoint = "";
let actions: string[] = [];
let denied = false;
let home: string;
let project: string;

const xmlEscape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      const action = body.get("Action") ?? "";
      actions.push(action);
      response.setHeader("content-type", "text/xml");
      if (action === "GetCallerIdentity") {
        response.end(
          `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Arn>arn:aws:sts::${ACCOUNT}:assumed-role/Dev/carol</Arn><UserId>AROA:carol</UserId><Account>${ACCOUNT}</Account></GetCallerIdentityResult><ResponseMetadata><RequestId>r</RequestId></ResponseMetadata></GetCallerIdentityResponse>`,
        );
      } else if (action === "GetTemplate" && denied) {
        response.statusCode = 403;
        response.end(
          `<ErrorResponse xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/"><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>User is not authorized to perform: cloudformation:GetTemplate on resource: arn</Message></Error><RequestId>r</RequestId></ErrorResponse>`,
        );
      } else if (action === "GetTemplate") {
        const template = readFileSync(join(TEMPLATES, "orders.v1.template.json"), "utf8");
        response.end(
          `<GetTemplateResponse xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/"><GetTemplateResult><TemplateBody>${xmlEscape(template)}</TemplateBody></GetTemplateResult><ResponseMetadata><RequestId>r</RequestId></ResponseMetadata></GetTemplateResponse>`,
        );
      } else {
        response.statusCode = 400;
        response.end(
          `<ErrorResponse><Error><Type>Sender</Type><Code>InvalidAction</Code><Message>x</Message></Error><RequestId>r</RequestId></ErrorResponse>`,
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  actions = [];
  denied = false;
  home = mkdtempSync(join(tmpdir(), "aws-infra-home-"));
  project = mkdtempSync(join(tmpdir(), "aws-infra-project-"));
  writeFileSync(join(home, "empty"), "");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

function run(args: string[], extra: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env["PATH"] ?? "",
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CLAUDE_PROJECT_DIR: project,
    AWS_CONFIG_FILE: join(home, "empty"),
    AWS_SHARED_CREDENTIALS_FILE: join(home, "empty"),
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_ENDPOINT_URL: endpoint,
    AWS_ACCESS_KEY_ID: KEY_ID,
    AWS_SECRET_ACCESS_KEY: KEY,
    AWS_REGION: "us-east-1",
    ...extra,
  };
  return runProcess(process.execPath, [cli, ...args], {}, env, project, 30_000);
}

describe.runIf(built)("aws-infrastructure CLI (bundled)", () => {
  it("inspects and reviews a real cdk.out without touching AWS", async () => {
    cpSync(join(FIXTURES, "cdk.out.orders"), join(project, "cdk.out"), { recursive: true });
    const inspect = await run(["inspect"]);
    expect(inspect.exitCode).toBe(0);
    expect(inspect.stdout).toContain("Stack OrdersStack");
    const review = await run(["review"]);
    expect(review.stdout).toContain("INFRA-NO-ALARMS");
    expect(actions).toEqual([]);
    for (const out of [inspect.stdout, review.stdout])
      expect(findSecretLikeStrings(out)).toEqual([]);
  });

  it("compares the deployed template with the local one, using only the two read calls", async () => {
    writeFileSync(
      join(project, "new.template.json"),
      readFileSync(join(TEMPLATES, "orders.v3-new-key.template.json")),
    );
    const result = await run(["diff", "--deployed", "OrdersStack", "new.template.json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      `deployed template of OrdersStack (account ${ACCOUNT}, us-east-1)`,
    );
    expect(result.stdout).toContain("INFRA-DIFF-STATEFUL-REPLACE");
    expect(actions).toEqual(["GetCallerIdentity", "GetTemplate"]);
    expect(actions.every((action) => ALLOWED.has(action))).toBe(true);
    for (const secret of [KEY_ID, KEY]) {
      expect(result.stdout).not.toContain(secret);
      expect(result.stderr).not.toContain(secret);
    }
  });

  it("names the missing permission when AWS denies the read", async () => {
    denied = true;
    writeFileSync(
      join(project, "new.template.json"),
      readFileSync(join(TEMPLATES, "orders.v1.template.json")),
    );
    const result = await run(["diff", "--deployed", "OrdersStack", "new.template.json"]);
    expect(result.stdout).toContain("Missing permission: cloudformation:GetTemplate");
    expect(result.stdout).not.toContain("on resource");
  });

  it("scaffolds files only with --write", async () => {
    await run(["scaffold", "s3-sqs-lambda", "Ingest"]);
    expect(existsSync(join(project, "lib"))).toBe(false);
    const written = await run(["scaffold", "s3-sqs-lambda", "Ingest", "--write"]);
    expect(written.stdout).toContain("Created lib/ingest-stack.ts");
    expect(existsSync(join(project, "lib", "ingest-stack.ts"))).toBe(true);
  });

  it("exits 2 on bad input", async () => {
    expect((await run(["frobnicate"])).exitCode).toBe(2);
  });
});

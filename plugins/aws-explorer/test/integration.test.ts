// Runs the bundled CLI against fake AWS endpoints on loopback (STS, CloudFormation, Cloud Control).
// No AWS account and no network beyond 127.0.0.1. Requires `pnpm build` (CI builds before testing).
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findSecretLikeStrings } from "@claude-code-aws/testkit";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runProcess } from "../../../packages/testkit/src/run-hook.js";
import type { Report } from "../src/lib/types.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.mjs");
const built = existsSync(cli);

const ACCOUNT = "123456789012";
const SECRET_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

/** Everything the CLI is allowed to ask AWS. Anything else fails the test. */
const READ_ONLY = new Set([
  "GetCallerIdentity",
  "ListStacks",
  "DescribeStacks",
  "ListStackResources",
  "DescribeStackEvents",
  "DescribeStackResource",
  "GetResource",
]);

let server: Server;
let endpoint = "";
let actions: string[] = [];
let home: string;
let mode: "ok" | "denied" = "ok";

const cfn = (action: string, inner: string): string =>
  `<${action}Response xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/"><${action}Result>${inner}</${action}Result><ResponseMetadata><RequestId>r</RequestId></ResponseMetadata></${action}Response>`;

const stackSummary = (name: string): string =>
  `<member><StackName>${name}</StackName><StackId>arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/${name}/1</StackId><StackStatus>CREATE_COMPLETE</StackStatus><CreationTime>2026-01-01T00:00:00Z</CreationTime></member>`;

function respond(
  body: URLSearchParams | null,
  target: string | undefined,
): { status: number; type: string; text: string; headers?: Record<string, string> } {
  if (target !== undefined) {
    actions.push(target.split(".").at(-1) ?? target);
    if (target.endsWith("GetResource")) {
      if (mode === "denied") {
        return {
          status: 400,
          type: "application/x-amz-json-1.0",
          headers: { "x-amzn-errortype": "AccessDeniedException" },
          text: JSON.stringify({
            __type: "AccessDeniedException",
            Message: "User is not authorized to perform: s3:GetBucketLocation",
          }),
        };
      }
      return {
        status: 200,
        type: "application/x-amz-json-1.0",
        text: JSON.stringify({
          TypeName: "AWS::S3::Bucket",
          ResourceDescription: {
            Identifier: "my-bucket",
            Properties: JSON.stringify({
              BucketName: "my-bucket",
              Tags: [{ Key: "db-password", Value: "hunter2" }],
            }),
          },
        }),
      };
    }
  }
  const action = body?.get("Action") ?? "";
  actions.push(action);
  const xml = (text: string, status = 200) => ({ status, type: "text/xml", text });
  const error = (code: string, message: string, status: number) =>
    xml(
      `<ErrorResponse xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/"><Error><Type>Sender</Type><Code>${code}</Code><Message>${message}</Message></Error><RequestId>r</RequestId></ErrorResponse>`,
      status,
    );
  if (action === "GetCallerIdentity") {
    return xml(
      `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Arn>arn:aws:sts::${ACCOUNT}:assumed-role/Developer/carol</Arn><UserId>AROA:carol</UserId><Account>${ACCOUNT}</Account></GetCallerIdentityResult><ResponseMetadata><RequestId>r</RequestId></ResponseMetadata></GetCallerIdentityResponse>`,
    );
  }
  if (mode === "denied" && action !== "DescribeStackResource") {
    return error(
      "AccessDenied",
      `User is not authorized to perform: cloudformation:${action} on resource: *`,
      403,
    );
  }
  switch (action) {
    case "ListStacks":
      return body?.get("NextToken") === "page2"
        ? xml(cfn("ListStacks", `<StackSummaries>${stackSummary("web")}</StackSummaries>`))
        : xml(
            cfn(
              "ListStacks",
              `<StackSummaries>${stackSummary("api")}</StackSummaries><NextToken>page2</NextToken>`,
            ),
          );
    case "DescribeStacks":
      return body?.get("StackName") === "nope"
        ? error("ValidationError", "Stack with id nope does not exist", 400)
        : xml(
            cfn(
              "DescribeStacks",
              `<Stacks><member><StackName>api</StackName><StackId>arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/api/1</StackId><StackStatus>UPDATE_COMPLETE</StackStatus><CreationTime>2026-01-01T00:00:00Z</CreationTime><Parameters><member><ParameterKey>DbPassword</ParameterKey><ParameterValue>hunter2</ParameterValue></member><member><ParameterKey>Stage</ParameterKey><ParameterValue>prod</ParameterValue></member></Parameters><Outputs><member><OutputKey>Url</OutputKey><OutputValue>https://example.com</OutputValue></member></Outputs></member></Stacks>`,
            ),
          );
    case "ListStackResources":
      return xml(
        cfn(
          "ListStackResources",
          `<StackResourceSummaries><member><LogicalResourceId>Bucket</LogicalResourceId><PhysicalResourceId>my-bucket</PhysicalResourceId><ResourceType>AWS::S3::Bucket</ResourceType><LastUpdatedTimestamp>2026-01-01T00:00:00Z</LastUpdatedTimestamp><ResourceStatus>CREATE_COMPLETE</ResourceStatus></member></StackResourceSummaries>`,
        ),
      );
    case "DescribeStackEvents":
      return xml(
        cfn(
          "DescribeStackEvents",
          `<StackEvents><member><StackId>s</StackId><EventId>e1</EventId><StackName>api</StackName><LogicalResourceId>Fn</LogicalResourceId><ResourceType>AWS::Lambda::Function</ResourceType><Timestamp>2026-01-02T00:00:00Z</Timestamp><ResourceStatus>CREATE_FAILED</ResourceStatus><ResourceStatusReason>Role missing</ResourceStatusReason></member></StackEvents>`,
        ),
      );
    case "DescribeStackResource":
      return xml(
        cfn(
          "DescribeStackResource",
          `<StackResourceDetail><LogicalResourceId>Bucket</LogicalResourceId><PhysicalResourceId>my-bucket</PhysicalResourceId><ResourceType>AWS::S3::Bucket</ResourceType><LastUpdatedTimestamp>2026-01-01T00:00:00Z</LastUpdatedTimestamp><ResourceStatus>CREATE_COMPLETE</ResourceStatus></StackResourceDetail>`,
        ),
      );
    default:
      return error("InvalidAction", `unexpected ${action}`, 400);
  }
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const target = request.headers["x-amz-target"];
      const result = respond(
        typeof target === "string" ? null : new URLSearchParams(raw),
        typeof target === "string" ? target : undefined,
      );
      response.writeHead(result.status, { "content-type": result.type, ...result.headers });
      response.end(result.text);
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
  mode = "ok";
  home = mkdtempSync(join(tmpdir(), "aws-explorer-home-"));
  writeFileSync(join(home, "empty-aws-file"), "");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function run(args: string[], extra: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env["PATH"] ?? "",
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CLAUDE_PROJECT_DIR: home,
    AWS_CONFIG_FILE: join(home, "empty-aws-file"),
    AWS_SHARED_CREDENTIALS_FILE: join(home, "empty-aws-file"),
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_ENDPOINT_URL: endpoint,
    AWS_ACCESS_KEY_ID: SECRET_KEY_ID,
    AWS_SECRET_ACCESS_KEY: SECRET_KEY,
    AWS_REGION: "us-east-1",
    ...extra,
  };
  return runProcess(process.execPath, [cli, ...args], {}, env, home, 30_000);
}

const asReport = (stdout: string): Report => JSON.parse(stdout) as Report;

describe.runIf(built)("aws-explorer CLI (bundled, fake AWS on loopback)", () => {
  it("lists stacks across pages, verified by STS, using only read calls", async () => {
    const result = await run(["stacks", "--json"]);
    expect(result.exitCode).toBe(0);
    const report = asReport(result.stdout);
    expect(report.header).toMatchObject({ accountId: ACCOUNT, region: "us-east-1" });
    expect((report.data as { items: Array<{ name: string }> }).items.map((s) => s.name)).toEqual([
      "api",
      "web",
    ]);
    expect(report.truncated).toBe("none");
    expect(actions[0]).toBe("GetCallerIdentity");
    expect(actions.every((action) => READ_ONLY.has(action))).toBe(true);
    expect(actions.filter((action) => action === "ListStacks")).toHaveLength(2);
  });

  it("shows a stack, redacting secrets, and never leaks credentials", async () => {
    const result = await run(["stack", "api"]);
    expect(result.stdout).toContain("DbPassword = [redacted]");
    expect(result.stdout).toContain("Stage = prod");
    expect(result.stdout).not.toContain("hunter2");
    for (const text of [result.stdout, result.stderr]) {
      for (const secret of [SECRET_KEY_ID, SECRET_KEY]) expect(text).not.toContain(secret);
      expect(findSecretLikeStrings(text)).toEqual([]);
    }
  });

  it("lists resources and events and reads properties through Cloud Control", async () => {
    expect((await run(["resources", "api"])).stdout).toMatch(
      /Bucket\s+AWS::S3::Bucket\s+my-bucket/,
    );
    expect((await run(["events", "api"])).stdout).toContain("! CREATE_FAILED");
    const resource = await run(["resource", "--stack", "api", "Bucket"]);
    expect(resource.stdout).toContain('"BucketName": "my-bucket"');
    expect(resource.stdout).not.toContain("hunter2");
    expect(actions.every((action) => READ_ONLY.has(action))).toBe(true);
    expect(actions).toContain("GetResource");
  });

  it("reports a missing stack as not found", async () => {
    const report = asReport((await run(["stack", "nope", "--json"])).stdout);
    expect(report.unavailable?.code).toBe("NOT_FOUND");
  });

  it("names the missing permission when AWS denies a call", async () => {
    mode = "denied";
    const text = (await run(["stacks"])).stdout;
    expect(text).toContain("ACCESS_DENIED");
    expect(text).toContain("Missing permission: cloudformation:ListStacks");
    const part = await run(["resource", "--stack", "api", "Bucket"]);
    expect(part.stdout).toContain("Missing permission: s3:GetBucketLocation");
    expect(part.stdout).toContain("AWS::S3::Bucket");
  });

  it("stops with a clear message when no region is set", async () => {
    const result = await run(["stacks"], { AWS_REGION: "", AWS_DEFAULT_REGION: "" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("NO_REGION");
    expect(actions).toEqual([]);
  });

  it("falls back to AWS_DEFAULT_REGION like the AWS CLI", async () => {
    const result = await run(["stacks", "--json"], {
      AWS_REGION: "",
      AWS_DEFAULT_REGION: "eu-west-1",
    });
    expect(asReport(result.stdout).header?.region).toBe("eu-west-1");
  });

  it("reports unreachable AWS without SDK text", async () => {
    const result = await run(["stacks"], { AWS_ENDPOINT_URL: "http://127.0.0.1:1" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/OFFLINE|UNKNOWN_ERROR/);
    expect(result.stdout).not.toContain("ECONNREFUSED");
  });

  it("exits 2 on bad input without calling AWS", async () => {
    const result = await run(["stack", "bad name!"]);
    expect(result.exitCode).toBe(2);
    expect(actions).toEqual([]);
  });
});

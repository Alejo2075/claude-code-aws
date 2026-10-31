import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authMatrix, renderAuth } from "../src/lib/auth.js";
import { runCli } from "../src/lib/cli.js";
import { explainDenied } from "../src/lib/denied.js";
import { applyExclusions, parseExclusions } from "../src/lib/exclusions.js";
import { deps, FIXTURES, NOW, TEMPLATES, template } from "./helpers.js";
import { makeFinding } from "@claude-code-aws/report-contract";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-sec-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const seed = (name: string): void => {
  writeFileSync(
    join(root, "t.template.json"),
    readFileSync(join(TEMPLATES, `${name}.template.json`)),
  );
};
const jsonOf = (text: string): Record<string, unknown> =>
  JSON.parse(text) as Record<string, unknown>;

describe("explainDenied", () => {
  const base =
    "User: arn:aws:sts::123456789012:assumed-role/App/session is not authorized to perform: dynamodb:PutItem on resource: arn:aws:dynamodb:us-east-1:123456789012:table/T";

  it("reads an implicit deny in an identity policy and proposes the missing statement as a proposal", () => {
    const result = explainDenied(
      `${base} because no identity-based policy allows the dynamodb:PutItem action`,
    );
    expect(result).toMatchObject({
      parsed: true,
      cause: "no-identity-policy",
      action: "dynamodb:PutItem",
    });
    expect(result.resource).toContain("table/T");
    expect(result.proposal).toEqual({
      Effect: "Allow",
      Action: ["dynamodb:PutItem"],
      Resource: [result.resource],
    });
    expect(result.caveats.join(" ")).toContain("starting point");
  });

  it.each([
    ["with an explicit deny in an identity-based policy", "explicit-deny-identity"],
    ["with an explicit deny in a service control policy", "explicit-deny-scp"],
    ["with an explicit deny in a resource-based policy", "explicit-deny-resource"],
    ["with an explicit deny in a permissions boundary", "explicit-deny-boundary"],
    ["because no resource-based policy allows the dynamodb:PutItem action", "no-resource-policy"],
    ["because no service control policy allows the dynamodb:PutItem action", "no-scp"],
    [
      "because no permissions boundary allows the dynamodb:PutItem action",
      "no-permissions-boundary",
    ],
    ["because no session policy allows the dynamodb:PutItem action", "no-session-policy"],
    ["because no VPC endpoint policy allows the dynamodb:PutItem action", "no-vpc-endpoint-policy"],
  ])("recognizes %s", (tail, cause) => {
    const result = explainDenied(`${base} ${tail}`);
    expect(result.cause).toBe(cause);
    expect(result.proposal).toBeNull();
  });

  it("says that an explicit deny cannot be fixed by adding an Allow", () => {
    expect(
      explainDenied(`${base} with an explicit deny in an identity-based policy`).checks.join(" "),
    ).toContain("adding an Allow will not help");
  });

  it("does not guess from a bare Access Denied or from nonsense", () => {
    const bare = explainDenied(
      "An error occurred (AccessDenied) when calling the GetObject operation: Access Denied",
    );
    expect(bare).toMatchObject({ parsed: false, cause: "unknown", proposal: null });
    expect(bare.checks.join(" ")).toContain("complete error message");
    expect(explainDenied("").parsed).toBe(false);
    expect(explainDenied("x".repeat(100_000)).parsed).toBe(false);
  });
});

describe("auth matrix", () => {
  it("lists HTTP routes with their authorizer and flags the public one", () => {
    const matrix = authMatrix(template("auth-api.v1"));
    expect(matrix.rows).toHaveLength(3);
    const unauthenticated = matrix.rows.filter((row) => row.authorization === "NONE");
    expect(unauthenticated.map((row) => row.route)).toEqual(["GET /health"]);
    expect(matrix.authorizers[0]).toMatchObject({ type: "JWT", issuer: true });
    expect(matrix.authorizers[0]?.audience).toBe(1);
    expect(matrix.cors[0]?.allowOrigins).toEqual(["https://app.example.com"]);
    const text = renderAuth(matrix);
    expect(text).toContain("<-- no authorization");
    expect(text).toContain("Authentication is not authorization");
  });

  it("reads REST methods with their resolved path and API key requirement", () => {
    const rest = {
      Resources: {
        Api: { Type: "AWS::ApiGateway::RestApi", Properties: {} },
        Users: {
          Type: "AWS::ApiGateway::Resource",
          Properties: {
            PathPart: "users",
            ParentId: { "Fn::GetAtt": ["Api", "RootResourceId"] },
            RestApiId: { Ref: "Api" },
          },
        },
        User: {
          Type: "AWS::ApiGateway::Resource",
          Properties: { PathPart: "{id}", ParentId: { Ref: "Users" }, RestApiId: { Ref: "Api" } },
        },
        Get: {
          Type: "AWS::ApiGateway::Method",
          Properties: {
            HttpMethod: "GET",
            ResourceId: { Ref: "User" },
            RestApiId: { Ref: "Api" },
            AuthorizationType: "NONE",
            ApiKeyRequired: true,
          },
        },
      },
    };
    const matrix = authMatrix({
      ...template("auth-api.v1"),
      resources: Object.fromEntries(
        Object.entries(rest.Resources).map(([id, r]) => [
          id,
          {
            logicalId: id,
            type: r.Type,
            properties: r.Properties,
            deletionPolicy: null,
            updateReplacePolicy: null,
            dependsOn: [],
            condition: null,
            metadata: {},
          },
        ]),
      ),
      raw: rest,
    });
    expect(matrix.rows[0]).toMatchObject({
      kind: "rest",
      route: "GET /users/{id}",
      apiKeyRequired: true,
    });
  });

  it("says plainly when there are no routes", () => {
    expect(renderAuth(authMatrix(template("orders.v1")))).toContain("No API Gateway routes");
  });
});

describe("exclusions", () => {
  const finding = (severity: "low" | "medium" | "high", subject = "Fn") =>
    makeFinding({
      ruleId: "SEC-X",
      plugin: "aws-security",
      severity,
      status: "confirmed",
      source: "static",
      title: "t",
      explanation: "e",
      subject,
      affectedResources: [subject],
    });
  const parse = (value: unknown, source: "user" | "project" = "user") =>
    parseExclusions(JSON.stringify(value), source);

  it("requires a rule and a reason, and rejects invalid dates", () => {
    const parsed = parse({
      version: 1,
      exclusions: [
        { ruleId: "A", reason: "ok" },
        { ruleId: "B" },
        { ruleId: "C", reason: "r", expires: "nonsense" },
        "x",
      ],
    });
    expect(parsed.exclusions).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(3);
    expect(parseExclusions("{ no", "user").warnings).toHaveLength(1);
    expect(parse({ version: 2 }).exclusions).toEqual([]);
  });

  it("hides a low finding with a reason, and keeps it visible in the count", () => {
    const { exclusions } = parse({
      version: 1,
      exclusions: [{ ruleId: "SEC-X", logicalId: "Fn", reason: "accepted" }],
    });
    const out = applyExclusions([finding("low"), finding("low", "Other")], exclusions, NOW);
    expect(out.kept).toHaveLength(1);
    expect(out.suppressed[0]?.exclusion.reason).toBe("accepted");
  });

  it("requires an expiry above low severity, and ignores an expired one", () => {
    const noExpiry = parse({
      version: 1,
      exclusions: [{ ruleId: "SEC-X", reason: "r" }],
    }).exclusions;
    expect(applyExclusions([finding("medium")], noExpiry, NOW).kept).toHaveLength(1);
    const expired = parse({
      version: 1,
      exclusions: [{ ruleId: "SEC-X", reason: "r", expires: "2026-01-01" }],
    }).exclusions;
    const out = applyExclusions([finding("medium")], expired, NOW);
    expect(out.kept).toHaveLength(1);
    expect(out.notes[0]).toContain("has expired");
    const valid = parse({
      version: 1,
      exclusions: [{ ruleId: "SEC-X", reason: "r", expires: "2027-01-01" }],
    }).exclusions;
    expect(applyExclusions([finding("medium")], valid, NOW).suppressed).toHaveLength(1);
  });

  it("never lets the project file hide a high finding, but lets the user file do it", () => {
    const body = {
      version: 1,
      exclusions: [{ ruleId: "SEC-X", reason: "r", expires: "2027-01-01" }],
    };
    const project = applyExclusions([finding("high")], parse(body, "project").exclusions, NOW);
    expect(project.kept).toHaveLength(1);
    expect(project.notes[0]).toContain("cannot hide high or critical");
    expect(
      applyExclusions([finding("high")], parse(body, "user").exclusions, NOW).suppressed,
    ).toHaveLength(1);
  });
});

describe("audit", () => {
  it("reports the flawed fixture's findings with evidence, worst first, and lists nothing as hidden", async () => {
    seed("flawed.v1");
    const result = await runCli(["audit", "t.template.json"], deps(root));
    expect(result.stdout.indexOf("high or critical")).toBeGreaterThan(-1);
    for (const id of [
      "SEC-IAM-WILDCARD-ACTION",
      "SEC-RES-PUBLIC-PRINCIPAL",
      "SEC-LAMBDA-URL-NO-AUTH",
      "SEC-LAMBDA-SECRET-ENV",
      "SEC-IAM-PASSROLE-WILDCARD",
    ]) {
      expect(result.stdout).toContain(id);
    }
    expect(result.stdout).not.toContain("hunter2");
    expect(result.stdout.indexOf("[CRITICAL]")).toBeLessThan(result.stdout.indexOf("[LOW]"));
    expect(result.stdout).toContain("enforcement boundary");
    const report = jsonOf(
      (await runCli(["audit", "t.template.json", "--json"], deps(root))).stdout,
    );
    expect(report).toMatchObject({ plugin: "aws-security", mode: "local" });
  });

  it("applies visible exclusions and lists what they hid", async () => {
    seed("flawed.v1");
    const exclusions = parseExclusions(
      JSON.stringify({
        version: 1,
        exclusions: [
          { ruleId: "SEC-SNS-NO-ENCRYPTION", reason: "test topic" },
          { ruleId: "SEC-COGNITO-NO-MFA", reason: "test pool" },
        ],
      }),
      "user",
    ).exclusions;
    const withTopic = await runCli(
      ["audit", "t.template.json"],
      deps(root, {
        exclusions: () => ({ exclusions, warnings: ["user config: example warning"] }),
      }),
    );
    expect(withTopic.stdout).toContain("example warning");
    const hidden = parseExclusions(
      JSON.stringify({
        version: 1,
        exclusions: [{ ruleId: "SEC-S3-SSL-NOT-ENFORCED", reason: "internal bucket" }],
      }),
      "user",
    ).exclusions;
    const hiddenRun = await runCli(
      ["audit", "t.template.json", "--json"],
      deps(root, { exclusions: () => ({ exclusions: hidden, warnings: [] }) }),
    );
    const report = jsonOf(hiddenRun.stdout);
    expect(report["suppressed"]).toBe(1);
    expect(JSON.stringify(report["limitations"])).toContain(
      "Hidden by your user exclusion: SEC-S3-SSL-NOT-ENFORCED",
    );
    expect(JSON.stringify(report["findings"])).not.toContain("SEC-S3-SSL-NOT-ENFORCED");
  });

  it("says nothing was audited when there are no templates", async () => {
    expect((await runCli(["audit"], deps(root))).stdout).toContain("nothing was audited");
  });
});

describe("iam", () => {
  it("lists statements and findings for a directory", async () => {
    cpSync(join(FIXTURES, "cdk.out.orders"), join(root, "cdk.out"), { recursive: true });
    const result = await runCli(["iam"], deps(root));
    expect(result.stdout).toMatch(/\d+ statement\(s\)/);
    expect(result.stdout).toContain("[trust]");
  });

  it("analyzes a pasted policy, a trust policy, and rejects bad input and paths outside the project", async () => {
    writeFileSync(
      join(root, "p.json"),
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
      }),
    );
    expect((await runCli(["iam", "--policy", "p.json"], deps(root))).stdout).toContain(
      "SEC-IAM-WILDCARD-ACTION",
    );
    writeFileSync(
      join(root, "t.json"),
      JSON.stringify({
        Statement: [{ Effect: "Allow", Action: "sts:AssumeRole", Principal: "*" }],
      }),
    );
    expect((await runCli(["iam", "--policy", "t.json", "--trust"], deps(root))).stdout).toContain(
      "SEC-IAM-TRUST-WILDCARD-PRINCIPAL",
    );
    writeFileSync(join(root, "bad.json"), "{ nope");
    expect((await runCli(["iam", "--policy", "bad.json"], deps(root))).stdout).toContain(
      "not valid JSON",
    );
    writeFileSync(join(root, "empty.json"), "{}");
    expect((await runCli(["iam", "--policy", "empty.json"], deps(root))).stdout).toContain(
      "No Statement",
    );
    expect((await runCli(["iam", "--policy", "../outside.json"], deps(root))).stdout).toContain(
      "outside the project",
    );
  });

  it("explains an AccessDenied message", async () => {
    const message =
      "User: arn:aws:sts::123456789012:assumed-role/App/s is not authorized to perform: s3:GetObject on resource: arn:aws:s3:::b/k because no identity-based policy allows the s3:GetObject action";
    const result = await runCli(["iam", "--explain", message], deps(root));
    expect(result.stdout).toContain("Cause: no-identity-policy");
    expect(result.stdout).toContain("A starting point for the missing statement");
    expect(result.stdout).toContain("AWS was not contacted");
  });
});

describe("auth command and usage", () => {
  it("prints the matrix and the API findings", async () => {
    seed("auth-api.missing-auth");
    const result = await runCli(["auth", "t.template.json"], deps(root));
    expect(result.stdout).toContain("POST /admin");
    expect(result.stdout).toContain("SEC-APIGW-UNAUTHENTICATED-ROUTE");
  });

  it("rejects unknown commands and options, and offers nothing that changes anything", async () => {
    for (const argv of [
      [],
      ["fix"],
      ["audit", "--bogus"],
      ["iam", "--explain"],
      ["audit", "a", "b"],
    ]) {
      expect((await runCli(argv, deps(root))).exitCode).toBe(2);
    }
    expect((await runCli([], deps(root))).stdout).toContain("changes nothing");
    mkdirSync(join(root, "x"));
  });
});

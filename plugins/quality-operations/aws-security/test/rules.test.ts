import { describe, expect, it } from "vitest";

import { SECURITY_RULES } from "../src/lib/rules.js";
import { inline, NOW, policy, template } from "./helpers.js";

const hits = (id: string, t = template("flawed.v1")) => {
  const rule = SECURITY_RULES.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(id);
  return rule.check(t, { now: NOW });
};
const none = (id: string, t = template("s3-ingest.v1")): void => {
  expect(hits(id, t)).toEqual([]);
};

describe("security rule pack", () => {
  it("gives every rule a unique id, a rationale, and an official source", () => {
    const ids = SECURITY_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of SECURITY_RULES) {
      expect(rule.id).toMatch(/^SEC-[A-Z0-9-]+$/);
      expect(rule.pack).toBe("security");
      expect(rule.rationale.length).toBeGreaterThan(20);
      expect(rule.source).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
    }
  });
});

describe("IAM rules", () => {
  it("SEC-IAM-WILDCARD-ACTION flags * and says when it is also on every resource", () => {
    expect(hits("SEC-IAM-WILDCARD-ACTION")[0]?.explanation).toContain(
      "every action on every resource",
    );
    none("SEC-IAM-WILDCARD-ACTION");
    none("SEC-IAM-WILDCARD-ACTION", template("orders.v1"));
  });

  it("SEC-IAM-SERVICE-WILDCARD flags service:* and calls out iam:*", () => {
    const flagged = hits(
      "SEC-IAM-SERVICE-WILDCARD",
      policy([{ Effect: "Allow", Action: ["s3:*", "iam:*"], Resource: "arn:x" }]),
    );
    expect(flagged).toHaveLength(2);
    expect(flagged[1]?.explanation).toContain("granting itself more permissions");
    expect(
      hits(
        "SEC-IAM-SERVICE-WILDCARD",
        policy([{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:x" }]),
      ),
    ).toEqual([]);
  });

  it("SEC-IAM-WILDCARD-RESOURCE flags writes on * but not CDK's X-Ray statement or read-only actions", () => {
    expect(
      hits(
        "SEC-IAM-WILDCARD-RESOURCE",
        policy([{ Effect: "Allow", Action: "s3:PutObject", Resource: "*" }]),
      ),
    ).toHaveLength(1);
    expect(
      hits(
        "SEC-IAM-WILDCARD-RESOURCE",
        policy([
          {
            Effect: "Allow",
            Action: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
            Resource: "*",
          },
        ]),
      ),
    ).toEqual([]);
    expect(
      hits(
        "SEC-IAM-WILDCARD-RESOURCE",
        policy([
          {
            Effect: "Allow",
            Action: ["ec2:DescribeInstances", "s3:ListAllMyBuckets"],
            Resource: "*",
          },
        ]),
      ),
    ).toEqual([]);
    none("SEC-IAM-WILDCARD-RESOURCE", template("orders.v1"));
  });

  it("SEC-IAM-PASSROLE-WILDCARD flags PassRole on * and passes a scoped one", () => {
    expect(hits("SEC-IAM-PASSROLE-WILDCARD")).toHaveLength(1);
    expect(
      hits(
        "SEC-IAM-PASSROLE-WILDCARD",
        policy([
          {
            Effect: "Allow",
            Action: "iam:PassRole",
            Resource: "arn:aws:iam::123456789012:role/app",
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("SEC-IAM-PRIVILEGE-ESCALATION flags permission-changing actions on *", () => {
    expect(
      hits(
        "SEC-IAM-PRIVILEGE-ESCALATION",
        policy([
          { Effect: "Allow", Action: ["iam:AttachRolePolicy", "s3:GetObject"], Resource: "*" },
        ]),
      ),
    ).toHaveLength(1);
    expect(
      hits(
        "SEC-IAM-PRIVILEGE-ESCALATION",
        policy([
          {
            Effect: "Allow",
            Action: "iam:AttachRolePolicy",
            Resource: "arn:aws:iam::123456789012:role/x",
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("SEC-IAM-NOTACTION-ALLOW flags Allow with NotAction only", () => {
    expect(
      hits(
        "SEC-IAM-NOTACTION-ALLOW",
        policy([{ Effect: "Allow", NotAction: "iam:*", Resource: "*" }]),
      ),
    ).toHaveLength(1);
    expect(
      hits(
        "SEC-IAM-NOTACTION-ALLOW",
        policy([{ Effect: "Deny", NotAction: "iam:*", Resource: "*" }]),
      ),
    ).toEqual([]);
  });

  it("SEC-IAM-TRUST-WILDCARD-PRINCIPAL flags an open trust and passes a service or conditioned one", () => {
    const role = (principal: unknown, condition?: unknown) =>
      inline({
        R: {
          Type: "AWS::IAM::Role",
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Effect: "Allow",
                  Action: "sts:AssumeRole",
                  Principal: principal,
                  ...(condition ? { Condition: condition } : {}),
                },
              ],
            },
          },
        },
      });
    expect(hits("SEC-IAM-TRUST-WILDCARD-PRINCIPAL", role({ AWS: "*" }))).toHaveLength(1);
    expect(hits("SEC-IAM-TRUST-WILDCARD-PRINCIPAL", role("*"))).toHaveLength(1);
    expect(
      hits(
        "SEC-IAM-TRUST-WILDCARD-PRINCIPAL",
        role({ AWS: "*" }, { StringEquals: { "aws:PrincipalOrgID": "o-1" } }),
      ),
    ).toEqual([]);
    none("SEC-IAM-TRUST-WILDCARD-PRINCIPAL", template("flawed.v1"));
  });

  it("SEC-IAM-TRUST-CROSS-ACCOUNT-NO-CONDITION flags a literal account root and passes a conditioned one", () => {
    const role = (condition?: unknown) =>
      inline({
        R: {
          Type: "AWS::IAM::Role",
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Effect: "Allow",
                  Action: "sts:AssumeRole",
                  Principal: { AWS: "arn:aws:iam::210987654321:root" },
                  ...(condition ? { Condition: condition } : {}),
                },
              ],
            },
          },
        },
      });
    expect(hits("SEC-IAM-TRUST-CROSS-ACCOUNT-NO-CONDITION", role())).toHaveLength(1);
    expect(
      hits(
        "SEC-IAM-TRUST-CROSS-ACCOUNT-NO-CONDITION",
        role({ StringEquals: { "sts:ExternalId": "x" } }),
      ),
    ).toEqual([]);
    none("SEC-IAM-TRUST-CROSS-ACCOUNT-NO-CONDITION");
  });
});

describe("resource and storage rules", () => {
  it("SEC-RES-PUBLIC-PRINCIPAL flags the public bucket policy and Lambda permissions open to everyone", () => {
    const flagged = hits("SEC-RES-PUBLIC-PRINCIPAL").map((hit) => hit.logicalId ?? "");
    expect(flagged.some((id) => id.startsWith("PublicPolicy"))).toBe(true);
    expect(flagged.some((id) => id.startsWith("Leaky"))).toBe(true);
  });
  it("SEC-RES-PUBLIC-PRINCIPAL does not flag the enforceSSL Deny of a clean bucket", () => {
    none("SEC-RES-PUBLIC-PRINCIPAL");
  });

  it("SEC-S3-PUBLIC-ACCESS-BLOCK flags a bucket that allows public policies and passes a fully blocked one", () => {
    expect(hits("SEC-S3-PUBLIC-ACCESS-BLOCK")[0]?.explanation).toContain("BlockPublicPolicy");
    none("SEC-S3-PUBLIC-ACCESS-BLOCK");
    expect(
      hits(
        "SEC-S3-PUBLIC-ACCESS-BLOCK",
        inline({ B: { Type: "AWS::S3::Bucket", Properties: {} } }),
      )[0]?.explanation,
    ).toContain("account-level block");
  });

  it("SEC-S3-SSL-NOT-ENFORCED passes enforceSSL buckets and flags the others", () => {
    none("SEC-S3-SSL-NOT-ENFORCED");
    expect(hits("SEC-S3-SSL-NOT-ENFORCED")).toHaveLength(1);
  });

  it("SEC-KMS-NO-ROTATION and SEC-SNS-NO-ENCRYPTION and SEC-COGNITO-NO-MFA", () => {
    expect(
      hits("SEC-KMS-NO-ROTATION", inline({ K: { Type: "AWS::KMS::Key", Properties: {} } })),
    ).toHaveLength(1);
    expect(
      hits(
        "SEC-KMS-NO-ROTATION",
        inline({ K: { Type: "AWS::KMS::Key", Properties: { EnableKeyRotation: true } } }),
      ),
    ).toEqual([]);
    expect(
      hits(
        "SEC-KMS-NO-ROTATION",
        inline({ K: { Type: "AWS::KMS::Key", Properties: { KeySpec: "RSA_2048" } } }),
      ),
    ).toEqual([]);
    expect(
      hits("SEC-SNS-NO-ENCRYPTION", inline({ T: { Type: "AWS::SNS::Topic", Properties: {} } })),
    ).toHaveLength(1);
    expect(
      hits(
        "SEC-SNS-NO-ENCRYPTION",
        inline({ T: { Type: "AWS::SNS::Topic", Properties: { KmsMasterKeyId: "alias/aws/sns" } } }),
      ),
    ).toEqual([]);
    expect(hits("SEC-COGNITO-NO-MFA", template("auth-api.v1"))).toHaveLength(1);
    expect(
      hits(
        "SEC-COGNITO-NO-MFA",
        inline({
          U: { Type: "AWS::Cognito::UserPool", Properties: { MfaConfiguration: "OPTIONAL" } },
        }),
      ),
    ).toEqual([]);
  });
});

describe("Lambda rules", () => {
  it("SEC-LAMBDA-URL-NO-AUTH flags AuthType NONE", () => {
    expect(hits("SEC-LAMBDA-URL-NO-AUTH")).toHaveLength(1);
    expect(
      hits(
        "SEC-LAMBDA-URL-NO-AUTH",
        inline({ U: { Type: "AWS::Lambda::Url", Properties: { AuthType: "AWS_IAM" } } }),
      ),
    ).toEqual([]);
  });

  it("SEC-LAMBDA-SECRET-ENV flags a literal secret by name and never shows the value", () => {
    const [found] = hits("SEC-LAMBDA-SECRET-ENV");
    expect(found?.explanation).toContain("DB_PASSWORD");
    expect(JSON.stringify(found)).not.toContain("hunter2");
    expect(found?.at).toContain("Environment/Variables/DB_PASSWORD");
    none("SEC-LAMBDA-SECRET-ENV");
    const dynamic = inline({
      F: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Environment: {
            Variables: {
              DB_PASSWORD: "{{resolve:secretsmanager:db:SecretString:password}}",
              TABLE: "t",
            },
          },
        },
      },
    });
    expect(hits("SEC-LAMBDA-SECRET-ENV", dynamic)).toEqual([]);
  });

  it("SEC-LAMBDA-RUNTIME-UNSUPPORTED flags deprecated runtimes only", () => {
    expect(hits("SEC-LAMBDA-RUNTIME-UNSUPPORTED")[0]?.explanation).toContain("nodejs16.x");
    none("SEC-LAMBDA-RUNTIME-UNSUPPORTED");
  });
});

describe("API rules", () => {
  it("SEC-APIGW-UNAUTHENTICATED-ROUTE flags the public health route as medium-level and a sensitive route clearly", () => {
    const flagged = hits("SEC-APIGW-UNAUTHENTICATED-ROUTE", template("auth-api.v1"));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.explanation).toContain("/health");
    expect(flagged[0]?.explanation).not.toContain("looks sensitive");
    const missing = hits("SEC-APIGW-UNAUTHENTICATED-ROUTE", template("auth-api.missing-auth"));
    expect(missing).toHaveLength(2);
    expect(
      missing.some(
        (hit) => hit.explanation.includes("/admin") && hit.explanation.includes("looks sensitive"),
      ),
    ).toBe(true);
  });

  it("SEC-APIGW-UNAUTHENTICATED-ROUTE handles REST methods, OPTIONS, and API keys", () => {
    const rest = (method: Record<string, unknown>) =>
      inline({
        M: {
          Type: "AWS::ApiGateway::Method",
          Properties: { AuthorizationType: "NONE", ...method },
        },
      });
    expect(hits("SEC-APIGW-UNAUTHENTICATED-ROUTE", rest({ HttpMethod: "GET" }))).toHaveLength(1);
    expect(hits("SEC-APIGW-UNAUTHENTICATED-ROUTE", rest({ HttpMethod: "OPTIONS" }))).toEqual([]);
    expect(
      hits("SEC-APIGW-UNAUTHENTICATED-ROUTE", rest({ HttpMethod: "GET", ApiKeyRequired: true })),
    ).toEqual([]);
    expect(
      hits(
        "SEC-APIGW-UNAUTHENTICATED-ROUTE",
        rest({ HttpMethod: "GET", AuthorizationType: "COGNITO_USER_POOLS" }),
      ),
    ).toEqual([]);
  });

  it("SEC-APIGW-CORS-WILDCARD flags * and passes a named origin", () => {
    expect(hits("SEC-APIGW-CORS-WILDCARD", template("auth-api.open-cors"))).toHaveLength(1);
    expect(hits("SEC-APIGW-CORS-WILDCARD", template("auth-api.v1"))).toEqual([]);
  });

  it("SEC-APIGW-JWT-CONFIG passes the Cognito authorizer and flags one without an audience", () => {
    expect(hits("SEC-APIGW-JWT-CONFIG", template("auth-api.v1"))).toEqual([]);
    const bad = inline({
      A: {
        Type: "AWS::ApiGatewayV2::Authorizer",
        Properties: { AuthorizerType: "JWT", JwtConfiguration: { Audience: [] } },
      },
    });
    expect(hits("SEC-APIGW-JWT-CONFIG", bad)[0]?.explanation).toContain("no audience");
  });
});

describe("the secure scaffolds", () => {
  it.each(["queue-lambda-dynamodb", "http-api-cognito", "s3-sqs-lambda"])(
    "%s has no high or critical security finding",
    (name) => {
      const t = template(`scaffold.${name}`);
      const serious = SECURITY_RULES.filter(
        (rule) => rule.severity === "high" || rule.severity === "critical",
      ).flatMap((rule) => rule.check(t, { now: NOW }));
      expect(serious).toEqual([]);
    },
  );
});

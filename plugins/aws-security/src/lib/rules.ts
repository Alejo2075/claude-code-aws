// The `security` rule pack, over synthesized templates. Every rule has an id, a rationale, a source,
// and a positive and a negative fixture in the tests. Findings are what the template shows, so they
// are `confirmed` as facts about the template; they say nothing about the deployed account.
import {
  iamStatements,
  isWildcardPrincipal,
  type PolicyStatement,
  type ResourceInfo,
  type Rule,
  type RuleHit,
  resourcesOfType,
  runtimeStatus,
  type Template,
} from "@claude-code-aws/template-analysis";

const IAM_BEST = "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html";
const IAM_PASSROLE = "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html";
const IAM_CONFUSED = "https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html";
const S3_BPA =
  "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html";
const S3_SSL = "https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html";
const LAMBDA_URL = "https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html";
const LAMBDA_ENV = "https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html";
const LAMBDA_RUNTIMES = "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html";
const APIGW_AUTH =
  "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-to-api.html";
const HTTP_CORS = "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html";
const HTTP_JWT =
  "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html";
const KMS_ROTATE = "https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html";
const SNS_SSE = "https://docs.aws.amazon.com/sns/latest/dg/sns-server-side-encryption.html";
const COGNITO_MFA =
  "https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Actions that legitimately need Resource "*" (no resource-level permissions), or are read-only. */
const RESOURCELESS = new Set([
  "xray:PutTraceSegments",
  "xray:PutTelemetryRecords",
  "xray:GetSamplingRules",
  "xray:GetSamplingTargets",
  "ecr:GetAuthorizationToken",
  "sts:GetCallerIdentity",
  "logs:CreateLogGroup",
  "cloudwatch:PutMetricData",
]);
const READ_ONLY = /^[a-z0-9-]+:(Describe|List|Get|BatchGet)/i;

/** Single actions that let a principal raise its own privileges when the resource is not restricted. */
const ESCALATION = [
  "iam:CreatePolicyVersion",
  "iam:SetDefaultPolicyVersion",
  "iam:AttachRolePolicy",
  "iam:AttachUserPolicy",
  "iam:AttachGroupPolicy",
  "iam:PutRolePolicy",
  "iam:PutUserPolicy",
  "iam:PutGroupPolicy",
  "iam:CreateAccessKey",
  "iam:CreateLoginProfile",
  "iam:UpdateLoginProfile",
  "iam:UpdateAssumeRolePolicy",
  "iam:AddUserToGroup",
];

const SECRET_NAME = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|auth)/i;
const SENSITIVE_PATH =
  /(admin|internal|private|billing|payment|account|user|delete|manage|config)/i;

function allow(statements: PolicyStatement[]): PolicyStatement[] {
  return statements.filter((statement) => statement.effect === "Allow");
}

const hit = (statement: PolicyStatement, explanation: string): RuleHit => ({
  logicalId: statement.owner,
  at: statement.path,
  explanation,
});

const wildcardAction: Rule = {
  id: "SEC-IAM-WILDCARD-ACTION",
  pack: "security",
  severity: "high",
  title: "A policy allows every action",
  rationale:
    "An Action of * grants every permission the resource allows; it is the opposite of least privilege.",
  source: IAM_BEST,
  recommendation: "List only the actions the code calls, scoped to the resources it uses.",
  check: (template) =>
    allow(iamStatements(template))
      .filter((statement) => statement.kind !== "trust" && statement.actions.includes("*"))
      .map((statement) =>
        hit(
          statement,
          statement.resources.includes("*")
            ? `${statement.owner} allows every action on every resource (full administrator access).`
            : `${statement.owner} allows every action${statement.principals.length > 0 ? " to its principals" : ""}.`,
        ),
      ),
};

const serviceWildcard: Rule = {
  id: "SEC-IAM-SERVICE-WILDCARD",
  pack: "security",
  severity: "medium",
  title: "A policy allows every action of a service",
  rationale:
    "service:* includes administrative and destructive actions the code probably never calls.",
  source: IAM_BEST,
  recommendation: "Replace the wildcard with the specific actions the code needs.",
  check: (template) =>
    allow(iamStatements(template))
      .filter((statement) => statement.kind === "identity")
      .flatMap((statement) =>
        statement.actions
          .filter((action) => /^[a-z0-9-]+:\*$/i.test(action))
          .map((action) =>
            hit(
              statement,
              `${statement.owner} allows ${action}${action.toLowerCase() === "iam:*" ? ", which includes granting itself more permissions" : ""}.`,
            ),
          ),
      ),
};

const wildcardResource: Rule = {
  id: "SEC-IAM-WILDCARD-RESOURCE",
  pack: "security",
  severity: "medium",
  title: "A policy allows actions on every resource",
  rationale:
    "Without a resource, a bug or a compromised function can act on every matching resource in the account.",
  source: IAM_BEST,
  recommendation:
    "Scope the statement to the ARNs the code uses. Actions without resource-level permissions are exempt.",
  check: (template) =>
    allow(iamStatements(template))
      .filter(
        (statement) =>
          statement.kind === "identity" &&
          statement.resources.includes("*") &&
          !statement.actions.includes("*"),
      )
      .filter(
        (statement) =>
          !statement.actions.every((action) => RESOURCELESS.has(action) || READ_ONLY.test(action)),
      )
      .map((statement) =>
        hit(
          statement,
          `${statement.owner} allows ${statement.actions.filter((a) => !RESOURCELESS.has(a)).join(", ")} on Resource *.`,
        ),
      ),
};

const passRole: Rule = {
  id: "SEC-IAM-PASSROLE-WILDCARD",
  pack: "security",
  severity: "high",
  title: "iam:PassRole on every role",
  rationale:
    "A principal that can pass any role to a service can run code as a more privileged role.",
  source: IAM_PASSROLE,
  recommendation:
    "Restrict Resource to the specific role ARN and add an iam:PassedToService condition.",
  check: (template) =>
    allow(iamStatements(template))
      .filter(
        (statement) =>
          statement.kind === "identity" &&
          statement.actions.some(
            (a) => a.toLowerCase() === "iam:passrole" || a === "iam:*" || a === "*",
          ) &&
          statement.resources.includes("*") &&
          !statement.actions.includes("*"),
      )
      .map((statement) => hit(statement, `${statement.owner} allows iam:PassRole on Resource *.`)),
};

const escalation: Rule = {
  id: "SEC-IAM-PRIVILEGE-ESCALATION",
  pack: "security",
  severity: "high",
  title: "A policy allows changing permissions without restricting the target",
  rationale:
    "These actions let a principal grant itself or another identity more access, so an unrestricted resource makes them an escalation path.",
  source: IAM_BEST,
  recommendation:
    "Restrict the resource to the specific identities that may be changed, or remove the action and manage IAM through the deployment pipeline.",
  check: (template) =>
    allow(iamStatements(template))
      .filter(
        (statement) =>
          statement.kind === "identity" &&
          statement.resources.includes("*") &&
          !statement.actions.includes("*"),
      )
      .flatMap((statement) =>
        statement.actions
          .filter((action) =>
            ESCALATION.some((candidate) => candidate.toLowerCase() === action.toLowerCase()),
          )
          .map((action) => hit(statement, `${statement.owner} allows ${action} on Resource *.`)),
      ),
};

const notAction: Rule = {
  id: "SEC-IAM-NOTACTION-ALLOW",
  pack: "security",
  severity: "medium",
  title: "An Allow statement uses NotAction",
  rationale:
    "Allow with NotAction grants everything except the listed actions, including actions AWS adds later.",
  source: IAM_BEST,
  recommendation: "List the allowed actions explicitly.",
  check: (template) =>
    allow(iamStatements(template))
      .filter((statement) => statement.kind !== "trust" && statement.notActions.length > 0)
      .map((statement) =>
        hit(
          statement,
          `${statement.owner} allows everything except ${statement.notActions.join(", ")}.`,
        ),
      ),
};

const trustWildcard: Rule = {
  id: "SEC-IAM-TRUST-WILDCARD-PRINCIPAL",
  pack: "security",
  severity: "critical",
  title: "A role can be assumed by anyone",
  rationale:
    "A trust policy with Principal * and no condition lets any AWS principal that can reach the role assume it.",
  source: IAM_BEST,
  recommendation:
    "Name the principals that may assume the role, or add a condition such as aws:PrincipalOrgID.",
  check: (template) =>
    allow(iamStatements(template))
      .filter(
        (statement) =>
          statement.kind === "trust" &&
          statement.principals.some(isWildcardPrincipal) &&
          !statement.hasCondition,
      )
      .map((statement) =>
        hit(statement, `${statement.owner} trusts every principal with no condition.`),
      ),
};

const trustCrossAccount: Rule = {
  id: "SEC-IAM-TRUST-CROSS-ACCOUNT-NO-CONDITION",
  pack: "security",
  severity: "medium",
  title: "A role trusts another account's root with no condition",
  rationale:
    "Trusting an account root delegates the decision to that account's administrators; without ExternalId or an organization condition, a confused deputy can use it.",
  source: IAM_CONFUSED,
  recommendation:
    "Add an sts:ExternalId or aws:PrincipalOrgID condition, and trust the specific role instead of the account root when possible.",
  check: (template) =>
    allow(iamStatements(template))
      .filter((statement) => statement.kind === "trust" && !statement.hasCondition)
      .filter((statement) =>
        statement.principals.some((principal) =>
          /^AWS:(arn:aws[a-z-]*:iam::)?\d{12}(:root)?$/.test(principal),
        ),
      )
      .map((statement) =>
        hit(
          statement,
          `${statement.owner} trusts a literal account (${statement.principals.filter((p) => /\d{12}/.test(p)).join(", ")}) with no condition.`,
        ),
      ),
};

const publicResourcePolicy: Rule = {
  id: "SEC-RES-PUBLIC-PRINCIPAL",
  pack: "security",
  severity: "critical",
  title: "A resource policy allows everyone",
  rationale:
    "Principal * with no condition makes the resource reachable by anyone who can send the request, including anonymous callers where the service allows them.",
  source: IAM_BEST,
  recommendation:
    "Name the principals, or add a condition (aws:SourceArn, aws:SourceAccount, aws:PrincipalOrgID, or a VPC endpoint).",
  check: (template) =>
    allow(iamStatements(template))
      .filter(
        (statement) =>
          statement.kind === "resource" &&
          statement.principals.some(isWildcardPrincipal) &&
          !statement.hasCondition,
      )
      .map((statement) => ({
        ...hit(
          statement,
          `${statement.owner} (${statement.ownerType}) allows ${statement.actions.join(", ")} to everyone with no condition.`,
        ),
      })),
};

const s3PublicAccess: Rule = {
  id: "SEC-S3-PUBLIC-ACCESS-BLOCK",
  pack: "security",
  severity: "high",
  title: "A bucket does not block public access",
  rationale:
    "Without all four Block Public Access settings, a bucket policy or ACL mistake can expose objects.",
  source: S3_BPA,
  recommendation:
    "Set all four PublicAccessBlockConfiguration flags to true. The account-level setting is not visible in a template.",
  check: (template) =>
    resourcesOfType(template, "AWS::S3::Bucket").flatMap((bucket): RuleHit[] => {
      const config = bucket.properties["PublicAccessBlockConfiguration"];
      if (!isRecord(config)) {
        return [
          {
            logicalId: bucket.logicalId,
            explanation: `${bucket.logicalId} sets no PublicAccessBlockConfiguration; only an account-level block (not visible here) would protect it.`,
          },
        ];
      }
      const off = [
        "BlockPublicAcls",
        "BlockPublicPolicy",
        "IgnorePublicAcls",
        "RestrictPublicBuckets",
      ].filter((key) => config[key] !== true);
      return off.length === 0
        ? []
        : [
            {
              logicalId: bucket.logicalId,
              explanation: `${bucket.logicalId} does not enable ${off.join(", ")}.`,
            },
          ];
    }),
};

const s3Ssl: Rule = {
  id: "SEC-S3-SSL-NOT-ENFORCED",
  pack: "security",
  severity: "low",
  title: "A bucket accepts unencrypted transport",
  rationale:
    "Without a policy that denies aws:SecureTransport=false, requests over plain HTTP are accepted.",
  source: S3_SSL,
  recommendation:
    "Add a bucket policy that denies requests when aws:SecureTransport is false (CDK: enforceSSL: true).",
  check: (template) => {
    const statements = iamStatements(template).filter(
      (statement) => statement.ownerType === "AWS::S3::BucketPolicy" && statement.effect === "Deny",
    );
    const enforced = (bucket: ResourceInfo): boolean =>
      statements.some(
        (statement) =>
          JSON.stringify(statement.condition ?? {}).includes("aws:SecureTransport") &&
          JSON.stringify(template.resources[statement.owner]?.properties["Bucket"] ?? {}).includes(
            bucket.logicalId,
          ),
      );
    return resourcesOfType(template, "AWS::S3::Bucket")
      .filter((bucket) => !enforced(bucket))
      .map((bucket) => ({
        logicalId: bucket.logicalId,
        explanation: `${bucket.logicalId} has no policy denying non-TLS requests.`,
      }));
  },
};

const lambdaUrl: Rule = {
  id: "SEC-LAMBDA-URL-NO-AUTH",
  pack: "security",
  severity: "high",
  title: "A Lambda function URL needs no authentication",
  rationale: "AuthType NONE makes the function callable by anyone on the internet.",
  source: LAMBDA_URL,
  recommendation: "Use AWS_IAM, or put the function behind an authenticated API.",
  check: (template) =>
    resourcesOfType(template, "AWS::Lambda::Url")
      .filter((url) => url.properties["AuthType"] === "NONE")
      .map((url) => ({
        logicalId: url.logicalId,
        explanation: `${url.logicalId} has AuthType NONE.`,
      })),
};

const secretEnv: Rule = {
  id: "SEC-LAMBDA-SECRET-ENV",
  pack: "security",
  severity: "high",
  title: "A secret-looking value is stored in a function's environment",
  rationale:
    "Environment variables are readable by anyone who can read the function configuration, and they end up in the template, in version control, and in CloudFormation.",
  source: LAMBDA_ENV,
  recommendation:
    "Store the secret in Secrets Manager or SSM Parameter Store and read it at run time, or use a dynamic reference ({{resolve:secretsmanager:...}}). The value is deliberately not shown here.",
  check: (template) =>
    resourcesOfType(template, "AWS::Lambda::Function").flatMap((fn) => {
      const variables = (fn.properties["Environment"] as Record<string, unknown> | undefined)?.[
        "Variables"
      ];
      if (!isRecord(variables)) return [];
      return Object.entries(variables)
        .filter(
          ([name, value]) =>
            SECRET_NAME.test(name) &&
            typeof value === "string" &&
            value !== "" &&
            !value.startsWith("{{resolve:"),
        )
        .map(([name]) => ({
          logicalId: fn.logicalId,
          at: `Resources/${fn.logicalId}/Properties/Environment/Variables/${name}`,
          explanation: `${fn.logicalId} sets the variable ${name} to a literal value.`,
        }));
    }),
};

const runtimeUnsupported: Rule = {
  id: "SEC-LAMBDA-RUNTIME-UNSUPPORTED",
  pack: "security",
  severity: "medium",
  title: "A function uses a runtime that no longer gets security patches",
  rationale: "After deprecation AWS may stop applying security updates to the runtime.",
  source: LAMBDA_RUNTIMES,
  recommendation: "Move to a supported runtime. This uses a dated snapshot of the runtime table.",
  check: (template, { now }) =>
    resourcesOfType(template, "AWS::Lambda::Function").flatMap((fn) => {
      const runtime = fn.properties["Runtime"];
      const status = typeof runtime === "string" ? runtimeStatus(runtime, now) : null;
      return status?.state === "deprecated"
        ? [
            {
              logicalId: fn.logicalId,
              explanation: `${fn.logicalId} uses ${String(runtime)}, deprecated since ${status.deprecationDate ?? "earlier"}.`,
            },
          ]
        : [];
    }),
};

function httpRoutes(template: Template): Array<{ route: ResourceInfo; path: string }> {
  return resourcesOfType(template, "AWS::ApiGatewayV2::Route").map((route) => ({
    route,
    path: typeof route.properties["RouteKey"] === "string" ? route.properties["RouteKey"] : "",
  }));
}

const unauthenticatedRoute: Rule = {
  id: "SEC-APIGW-UNAUTHENTICATED-ROUTE",
  pack: "security",
  severity: "medium",
  title: "An API route needs no authorization",
  rationale:
    "A route with no authorizer is callable by anyone who can reach the API. That is right for a health check and wrong for anything that reads or changes user data.",
  source: APIGW_AUTH,
  recommendation:
    "Attach an authorizer, or confirm the route is meant to be public. Routes whose path looks sensitive are listed as high.",
  check: (template) => {
    const hits: RuleHit[] = [];
    for (const { route, path } of httpRoutes(template)) {
      if (path === "$default" || (route.properties["AuthorizationType"] ?? "NONE") !== "NONE")
        continue;
      const sensitive = SENSITIVE_PATH.test(path);
      hits.push({
        logicalId: route.logicalId,
        explanation: `${path} on ${route.logicalId} has no authorizer${sensitive ? ", and its path looks sensitive (confirm)" : ""}.`,
      });
    }
    for (const method of resourcesOfType(template, "AWS::ApiGateway::Method")) {
      if (
        (method.properties["AuthorizationType"] ?? "NONE") !== "NONE" ||
        method.properties["HttpMethod"] === "OPTIONS"
      )
        continue;
      if (method.properties["ApiKeyRequired"] === true) continue;
      hits.push({
        logicalId: method.logicalId,
        explanation: `${String(method.properties["HttpMethod"])} on ${method.logicalId} has no authorizer and requires no API key.`,
      });
    }
    return hits;
  },
};

const corsWildcard: Rule = {
  id: "SEC-APIGW-CORS-WILDCARD",
  pack: "security",
  severity: "medium",
  title: "An HTTP API allows every origin",
  rationale:
    "A wildcard origin lets any web page call the API from a browser. For an authenticated API that widens the reach of a stolen token.",
  source: HTTP_CORS,
  recommendation: "List the origins that may call the API.",
  check: (template) =>
    resourcesOfType(template, "AWS::ApiGatewayV2::Api").flatMap((api) => {
      const cors = api.properties["CorsConfiguration"];
      const origins =
        isRecord(cors) && Array.isArray(cors["AllowOrigins"])
          ? (cors["AllowOrigins"] as unknown[])
          : [];
      return origins.includes("*")
        ? [{ logicalId: api.logicalId, explanation: `${api.logicalId} allows the origin *.` }]
        : [];
    }),
};

const jwtConfig: Rule = {
  id: "SEC-APIGW-JWT-CONFIG",
  pack: "security",
  severity: "medium",
  title: "A JWT authorizer does not pin the audience or issuer",
  rationale:
    "Without an audience and an issuer, a token issued for another application or by another issuer may be accepted.",
  source: HTTP_JWT,
  recommendation:
    "Set JwtConfiguration.Audience to the app client ids and Issuer to the user pool.",
  check: (template) =>
    resourcesOfType(template, "AWS::ApiGatewayV2::Authorizer")
      .filter((authorizer) => authorizer.properties["AuthorizerType"] === "JWT")
      .flatMap((authorizer) => {
        const jwt = authorizer.properties["JwtConfiguration"];
        const audience =
          isRecord(jwt) && Array.isArray(jwt["Audience"]) ? jwt["Audience"].length : 0;
        const issuer = isRecord(jwt) && jwt["Issuer"] !== undefined;
        return audience > 0 && issuer
          ? []
          : [
              {
                logicalId: authorizer.logicalId,
                explanation: `${authorizer.logicalId} has ${audience === 0 ? "no audience" : "an audience"} and ${issuer ? "an issuer" : "no issuer"}.`,
              },
            ];
      }),
};

const kmsRotation: Rule = {
  id: "SEC-KMS-NO-ROTATION",
  pack: "security",
  severity: "low",
  title: "A KMS key does not rotate",
  rationale: "Automatic rotation limits how much data one key version protects.",
  source: KMS_ROTATE,
  recommendation: "Set EnableKeyRotation to true for symmetric keys.",
  check: (template) =>
    resourcesOfType(template, "AWS::KMS::Key")
      .filter(
        (key) =>
          key.properties["EnableKeyRotation"] !== true &&
          (key.properties["KeySpec"] ?? "SYMMETRIC_DEFAULT") === "SYMMETRIC_DEFAULT",
      )
      .map((key) => ({
        logicalId: key.logicalId,
        explanation: `${key.logicalId} does not enable key rotation.`,
      })),
};

const snsEncryption: Rule = {
  id: "SEC-SNS-NO-ENCRYPTION",
  pack: "security",
  severity: "low",
  title: "An SNS topic is not encrypted at rest",
  rationale: "Messages are stored unencrypted unless a KMS key is set.",
  source: SNS_SSE,
  recommendation: "Set KmsMasterKeyId (the AWS managed alias/aws/sns is enough for many cases).",
  check: (template) =>
    resourcesOfType(template, "AWS::SNS::Topic")
      .filter((topic) => topic.properties["KmsMasterKeyId"] === undefined)
      .map((topic) => ({
        logicalId: topic.logicalId,
        explanation: `${topic.logicalId} sets no KmsMasterKeyId.`,
      })),
};

const cognitoMfa: Rule = {
  id: "SEC-COGNITO-NO-MFA",
  pack: "security",
  severity: "low",
  title: "A user pool does not offer multi-factor authentication",
  rationale: "Passwords alone are the weakest sign-in factor.",
  source: COGNITO_MFA,
  recommendation: "Set MfaConfiguration to OPTIONAL or ON, with at least one factor enabled.",
  check: (template) =>
    resourcesOfType(template, "AWS::Cognito::UserPool")
      .filter((pool) => (pool.properties["MfaConfiguration"] ?? "OFF") === "OFF")
      .map((pool) => ({
        logicalId: pool.logicalId,
        explanation: `${pool.logicalId} has MFA off.`,
      })),
};

export const SECURITY_RULES: readonly Rule[] = [
  wildcardAction,
  serviceWildcard,
  wildcardResource,
  passRole,
  escalation,
  notAction,
  trustWildcard,
  trustCrossAccount,
  publicResourcePolicy,
  s3PublicAccess,
  s3Ssl,
  lambdaUrl,
  secretEnv,
  runtimeUnsupported,
  unauthenticatedRoute,
  corsWildcard,
  jwtConfig,
  kmsRotation,
  snsEncryption,
  cognitoMfa,
];

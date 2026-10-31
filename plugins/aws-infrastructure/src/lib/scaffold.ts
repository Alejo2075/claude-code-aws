// Generates CDK TypeScript for common serverless patterns with secure defaults. Nothing is written
// unless asked, and an existing file is never overwritten.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { isInside } from "@claude-code-aws/tool-runner";

export const PATTERNS = ["queue-lambda-dynamodb", "http-api-cognito", "s3-sqs-lambda"] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface ScaffoldFile {
  path: string;
  content: string;
}

const NAME = /^[A-Z][A-Za-z0-9]{0,40}$/;

const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const HANDLER_QUEUE = `// Replace with your logic. Returning the ids of failed records makes SQS retry only those
// (the event source is configured with reportBatchItemFailures).
export const handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event.Records ?? []) {
    try {
      JSON.parse(record.body);
    } catch {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
`;

const HANDLER_HTTP = `// Replace with your logic. The JWT authorizer has already verified the token when this runs.
export const handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ path: event.rawPath }),
});
`;

function queueLambdaDynamodb(name: string): ScaffoldFile[] {
  return [
    {
      path: `lib/${kebab(name)}-stack.ts`,
      content: `import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/** SQS queue (with a dead-letter queue) -> Lambda -> DynamoDB. */
export class ${name}Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const handlerTimeout = cdk.Duration.seconds(30);

    const dlq = new sqs.Queue(this, "Dlq", {
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });
    const queue = new sqs.Queue(this, "Queue", {
      // At least six times the function timeout, as the Lambda documentation recommends.
      visibilityTimeout: cdk.Duration.seconds(handlerTimeout.toSeconds() * 6),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
    });

    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // Keep the data if the stack is deleted. Change on purpose for disposable environments.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const handler = new lambda.Function(this, "Handler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("src/handler"),
      timeout: handlerTimeout,
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: { TABLE_NAME: table.tableName },
      logGroup: new logs.LogGroup(this, "HandlerLogs", { retention: logs.RetentionDays.ONE_MONTH }),
    });
    table.grantWriteData(handler);
    handler.addEventSource(new sources.SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }));

    new cdk.CfnOutput(this, "QueueUrl", { value: queue.queueUrl });
  }
}
`,
    },
    { path: "src/handler/index.mjs", content: HANDLER_QUEUE },
  ];
}

function httpApiCognito(name: string): ScaffoldFile[] {
  return [
    {
      path: `lib/${kebab(name)}-stack.ts`,
      content: `import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

/** HTTP API with a Cognito JWT authorizer on every route. */
export class ${name}Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      // Keep the users if the stack is deleted.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const client = pool.addClient("WebClient", { authFlows: { userSrp: true } });

    const handler = new lambda.Function(this, "Handler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("src/handler"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, "HandlerLogs", { retention: logs.RetentionDays.ONE_MONTH }),
    });

    const authorizer = new authorizers.HttpUserPoolAuthorizer("PoolAuthorizer", pool, { userPoolClients: [client] });
    const api = new apigw.HttpApi(this, "Api", {
      // Name the origins that may call the API; never "*" for an authenticated API.
      corsPreflight: {
        allowOrigins: ["https://app.example.com"],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST],
        allowHeaders: ["authorization", "content-type"],
      },
    });
    api.addRoutes({
      path: "/items",
      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("Integration", handler),
      authorizer,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: pool.userPoolId });
  }
}
`,
    },
    { path: "src/handler/index.mjs", content: HANDLER_HTTP },
  ];
}

function s3SqsLambda(name: string): ScaffoldFile[] {
  return [
    {
      path: `lib/${kebab(name)}-stack.ts`,
      content: `import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/** S3 object created -> SQS -> Lambda, with a dead-letter queue. */
export class ${name}Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const handlerTimeout = cdk.Duration.seconds(60);

    const bucket = new s3.Bucket(this, "Landing", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const dlq = new sqs.Queue(this, "Dlq", { encryption: sqs.QueueEncryption.SQS_MANAGED, enforceSSL: true });
    const queue = new sqs.Queue(this, "Queue", {
      visibilityTimeout: cdk.Duration.seconds(handlerTimeout.toSeconds() * 6),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(queue));

    const handler = new lambda.Function(this, "Ingest", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("src/handler"),
      timeout: handlerTimeout,
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, "IngestLogs", { retention: logs.RetentionDays.ONE_MONTH }),
    });
    bucket.grantRead(handler);
    handler.addEventSource(new sources.SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }));
  }
}
`,
    },
    { path: "src/handler/index.mjs", content: HANDLER_QUEUE },
  ];
}

function testFile(name: string): ScaffoldFile {
  return {
    path: `test/${kebab(name)}-stack.test.ts`,
    content: `import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import { ${name}Stack } from "../lib/${kebab(name)}-stack";

describe("${name}Stack", () => {
  const template = Template.fromStack(new ${name}Stack(new cdk.App(), "Test"));

  it("synthesizes", () => {
    expect(Object.keys(template.toJSON().Resources).length).toBeGreaterThan(0);
  });

  it("keeps the data of stateful resources when the stack is deleted", () => {
    const resources = template.toJSON().Resources as Record<string, { Type: string; DeletionPolicy?: string }>;
    for (const [id, resource] of Object.entries(resources)) {
      if (["AWS::DynamoDB::Table", "AWS::S3::Bucket", "AWS::Cognito::UserPool"].includes(resource.Type)) {
        expect(resource.DeletionPolicy, id).toBe("Retain");
      }
    }
  });
});
`,
  };
}

export interface ScaffoldPlan {
  pattern: Pattern;
  files: ScaffoldFile[];
}

export function planScaffold(pattern: string, name: string): ScaffoldPlan | { error: string } {
  if (!(PATTERNS as readonly string[]).includes(pattern)) {
    return { error: `Unknown pattern "${pattern}". Choose one of: ${PATTERNS.join(", ")}.` };
  }
  if (!NAME.test(name))
    return { error: "The name must be PascalCase letters and digits, such as Orders." };
  const build: Record<Pattern, (name: string) => ScaffoldFile[]> = {
    "queue-lambda-dynamodb": queueLambdaDynamodb,
    "http-api-cognito": httpApiCognito,
    "s3-sqs-lambda": s3SqsLambda,
  };
  const chosen = pattern as Pattern;
  return { pattern: chosen, files: [...build[chosen](name), testFile(name)] };
}

export interface WriteOutcome {
  written: string[];
  skipped: string[];
}

/** Writes the files that do not exist yet. Existing files are listed, never overwritten. */
export function writeScaffold(root: string, files: readonly ScaffoldFile[]): WriteOutcome {
  const outcome: WriteOutcome = { written: [], skipped: [] };
  for (const file of files) {
    const target = resolve(root, file.path);
    if (!isInside(root, target) || existsSync(target)) {
      outcome.skipped.push(file.path);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, { flag: "wx" });
    outcome.written.push(file.path);
  }
  return outcome;
}

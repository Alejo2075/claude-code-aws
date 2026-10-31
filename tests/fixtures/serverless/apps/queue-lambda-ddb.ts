// Fixture: SQS queue (with DLQ) -> Lambda -> DynamoDB. Variant "v2" renames the table's construct id
// (a logical id change) and "v3" changes the partition key (a replacement), to exercise diffs.
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";

const variant = process.env["VARIANT"] ?? "v1";
const app = new cdk.App();
const stack = new cdk.Stack(app, "OrdersStack");

const dlq = new sqs.Queue(stack, "OrdersDlq", { retentionPeriod: cdk.Duration.days(14), encryption: sqs.QueueEncryption.SQS_MANAGED });
const queue = new sqs.Queue(stack, "OrdersQueue", {
  visibilityTimeout: cdk.Duration.seconds(180),
  encryption: sqs.QueueEncryption.SQS_MANAGED,
  deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
});
const table = new dynamodb.Table(stack, variant === "v2" ? "OrdersTableRenamed" : "OrdersTable", {
  partitionKey: { name: variant === "v3" ? "orderKey" : "orderId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
const handler = new lambda.Function(stack, "OrdersHandler", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "index.handler",
  code: lambda.Code.fromInline("exports.handler = async () => ({ batchItemFailures: [] });"),
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,
  tracing: lambda.Tracing.ACTIVE,
  environment: { TABLE_NAME: table.tableName },
  logGroup: new logs.LogGroup(stack, "OrdersLogs", { retention: logs.RetentionDays.ONE_MONTH }),
});
table.grantWriteData(handler);
handler.addEventSource(new sources.SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }));

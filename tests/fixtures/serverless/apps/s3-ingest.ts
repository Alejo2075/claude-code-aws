// Fixture: S3 bucket -> SQS -> Lambda ingestion pipeline.
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "IngestStack");
const bucket = new s3.Bucket(stack, "Landing", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
const dlq = new sqs.Queue(stack, "IngestDlq", { encryption: sqs.QueueEncryption.SQS_MANAGED });
const queue = new sqs.Queue(stack, "IngestQueue", {
  visibilityTimeout: cdk.Duration.seconds(60),
  encryption: sqs.QueueEncryption.SQS_MANAGED,
  deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
});
bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(queue));
const fn = new lambda.Function(stack, "Ingest", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "index.handler",
  code: lambda.Code.fromInline("exports.handler = async () => {};"),
  timeout: cdk.Duration.seconds(30),
});
bucket.grantRead(fn);
fn.addEventSource(new sources.SqsEventSource(queue));

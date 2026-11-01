// Compact patterns a prototype can start from. Infrastructure for them is scaffolded by
// aws-infrastructure (`scaffold`); this catalog only says what to test and gives local fixtures.
export interface Pattern {
  id: string;
  title: string;
  summary: string;
  components: string[];
  /** The aws-infrastructure scaffold that matches, if one exists. */
  scaffold: string | null;
  defaultQuestion: string;
  costDrivers: string[];
  cleanupKinds: string[];
  permissions: string[];
  fixtures: Array<{ file: string; content: unknown }>;
}

const sqsRecord = {
  messageId: "fixture-1",
  body: JSON.stringify({ orderId: "o-1", total: 10 }),
  attributes: { ApproximateReceiveCount: "1" },
  eventSource: "aws:sqs",
};

export const PATTERNS: readonly Pattern[] = [
  {
    id: "api-lambda-dynamodb",
    title: "API Gateway + Lambda + DynamoDB",
    summary: "A request/response API that reads and writes one table.",
    components: ["HTTP API", "Lambda function", "DynamoDB table (on-demand)"],
    scaffold: null,
    defaultQuestion:
      "Does a single-table design serve the main read and write paths within the latency target?",
    costDrivers: ["API requests", "Lambda GB-seconds", "DynamoDB request units"],
    cleanupKinds: ["AWS::DynamoDB::Table", "AWS::Lambda::Function", "AWS::ApiGatewayV2::Api"],
    permissions: ["dynamodb:GetItem,PutItem,Query on the prototype table only"],
    fixtures: [
      {
        file: "fixtures/api-event.json",
        content: {
          version: "2.0",
          routeKey: "GET /orders/{id}",
          pathParameters: { id: "o-1" },
          headers: {},
          requestContext: { http: { method: "GET" } },
        },
      },
    ],
  },
  {
    id: "events-queue-lambda",
    title: "EventBridge + SQS + Lambda",
    summary: "Events routed to a queue and processed by a worker, with a dead-letter queue.",
    components: ["EventBridge rule", "SQS queue + DLQ", "Lambda worker"],
    scaffold: "queue-lambda-dynamodb",
    defaultQuestion:
      "Which batch size and concurrency keep the backlog bounded at the expected peak?",
    costDrivers: ["Lambda GB-seconds", "SQS requests", "EventBridge events"],
    cleanupKinds: ["AWS::SQS::Queue", "AWS::Events::Rule", "AWS::Lambda::Function"],
    permissions: ["sqs:ReceiveMessage,DeleteMessage on the prototype queue only"],
    fixtures: [{ file: "fixtures/sqs-event.json", content: { Records: [sqsRecord] } }],
  },
  {
    id: "s3-ingest",
    title: "S3 ingestion",
    summary: "Objects land in a bucket and trigger processing.",
    components: ["S3 bucket", "SQS queue", "Lambda"],
    scaffold: "s3-sqs-lambda",
    defaultQuestion:
      "Does the pipeline process the largest expected object within the function timeout?",
    costDrivers: ["S3 requests and storage", "Lambda GB-seconds"],
    cleanupKinds: ["AWS::S3::Bucket", "AWS::SQS::Queue", "AWS::Lambda::Function"],
    permissions: ["s3:GetObject on the prototype bucket prefix only"],
    fixtures: [
      {
        file: "fixtures/s3-event.json",
        content: {
          Records: [
            {
              eventSource: "aws:s3",
              s3: {
                bucket: { name: "prototype-bucket" },
                object: { key: "in/sample.json", size: 1024 },
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: "step-functions-workflow",
    title: "Step Functions workflow",
    summary: "A short workflow with retry and catch paths.",
    components: ["State machine", "Lambda tasks"],
    scaffold: null,
    defaultQuestion:
      "Does the retry and catch design keep a failing task from stalling the whole workflow?",
    costDrivers: ["State transitions (Standard) or requests and duration (Express)", "Lambda"],
    cleanupKinds: ["AWS::StepFunctions::StateMachine", "AWS::Lambda::Function"],
    permissions: ["lambda:InvokeFunction on the prototype functions only"],
    fixtures: [
      { file: "fixtures/workflow-input.json", content: { orderId: "o-1", simulateFailure: false } },
    ],
  },
  {
    id: "cognito-api",
    title: "Cognito-authenticated API",
    summary: "An HTTP API protected by a JWT authorizer from a user pool.",
    components: ["Cognito user pool", "HTTP API", "Lambda"],
    scaffold: "http-api-cognito",
    defaultQuestion: "Do the scopes and claims separate the roles the product needs?",
    costDrivers: ["Cognito monthly active users", "API requests", "Lambda"],
    cleanupKinds: ["AWS::Cognito::UserPool", "AWS::ApiGatewayV2::Api", "AWS::Lambda::Function"],
    permissions: ["No user creation in a shared pool; use a dedicated prototype pool"],
    fixtures: [
      {
        file: "fixtures/claims.json",
        content: {
          sub: "user-1",
          "cognito:groups": ["customers"],
          scope: "orders/read",
          iss: "https://cognito-idp.example.invalid/pool",
          aud: "client-1",
        },
      },
    ],
  },
  {
    id: "bedrock-request-response",
    title: "Bedrock request and response",
    summary: "A function that sends a prompt to a model and returns the answer.",
    components: ["Lambda", "Bedrock model invocation"],
    scaffold: null,
    defaultQuestion: "Is the answer quality and latency acceptable within a token budget?",
    costDrivers: ["Input and output tokens", "Lambda"],
    cleanupKinds: ["AWS::Lambda::Function"],
    permissions: ["bedrock:InvokeModel on the one model ARN under test"],
    fixtures: [
      {
        file: "fixtures/prompt.json",
        content: { prompt: "Summarize: <fixture text, no real data>", maxTokens: 200 },
      },
    ],
  },
  {
    id: "ses-event-flow",
    title: "SES event flow",
    summary: "Delivery, bounce, and complaint events from SES routed for handling.",
    components: ["SES configuration set", "SNS or EventBridge", "Lambda"],
    scaffold: null,
    defaultQuestion: "Are bounces and complaints handled before they hurt the sender reputation?",
    costDrivers: ["SES messages", "SNS or EventBridge events", "Lambda"],
    cleanupKinds: ["AWS::SES::ConfigurationSet", "AWS::Lambda::Function"],
    permissions: ["ses:SendEmail only to the SES mailbox simulator addresses"],
    fixtures: [
      {
        file: "fixtures/ses-bounce.json",
        content: {
          eventType: "Bounce",
          bounce: {
            bounceType: "Permanent",
            bouncedRecipients: [{ emailAddress: "bounce@simulator.amazonses.com" }],
          },
        },
      },
    ],
  },
];

export const patternById = (id: string): Pattern | null =>
  PATTERNS.find((p) => p.id === id) ?? null;

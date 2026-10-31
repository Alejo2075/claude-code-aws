// Event fixtures for the sources that invoke Lambda, with malformed and edge-case variants, and
// validators for the responses a handler must return. Identifiers are placeholders: account
// 123456789012, example.com. Shapes follow the AWS documentation for each source.
export const KINDS = [
  "apigw-http-v2",
  "apigw-rest-v1",
  "sqs",
  "sns",
  "eventbridge",
  "dynamodb-stream",
  "s3",
  "stepfunctions-task",
] as const;
export type Kind = (typeof KINDS)[number];

export const SOURCES: Record<Kind, string> = {
  "apigw-http-v2":
    "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html",
  "apigw-rest-v1":
    "https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html",
  sqs: "https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html",
  sns: "https://docs.aws.amazon.com/lambda/latest/dg/with-sns.html",
  eventbridge: "https://docs.aws.amazon.com/lambda/latest/dg/services-cloudwatchevents.html",
  "dynamodb-stream": "https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html",
  s3: "https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html",
  "stepfunctions-task": "https://docs.aws.amazon.com/step-functions/latest/dg/connect-lambda.html",
};

type Json = Record<string, unknown>;
const ACCOUNT = "123456789012";
const REGION = "us-east-1";

function sqsRecord(index: number, body: string): Json {
  return {
    messageId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    receiptHandle: `AQEB-example-${index}`,
    body,
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: "1767225600000",
      SenderId: "AIDAEXAMPLE",
      ApproximateFirstReceiveTimestamp: "1767225600005",
    },
    messageAttributes: {},
    md5OfBody: "00000000000000000000000000000000",
    eventSource: "aws:sqs",
    eventSourceARN: `arn:aws:sqs:${REGION}:${ACCOUNT}:orders`,
    awsRegion: REGION,
  };
}

const BASE: Record<Kind, () => Json> = {
  "apigw-http-v2": () => ({
    version: "2.0",
    routeKey: "GET /items/{id}",
    rawPath: "/items/42",
    rawQueryString: "",
    headers: { accept: "application/json", host: "api.example.com" },
    requestContext: {
      accountId: ACCOUNT,
      apiId: "abc123",
      domainName: "api.example.com",
      http: {
        method: "GET",
        path: "/items/42",
        protocol: "HTTP/1.1",
        sourceIp: "203.0.113.10",
        userAgent: "test",
      },
      requestId: "req-1",
      routeKey: "GET /items/{id}",
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: 1767225600000,
      authorizer: { jwt: { claims: { sub: "user-1", "cognito:username": "carol" }, scopes: null } },
    },
    pathParameters: { id: "42" },
    isBase64Encoded: false,
  }),
  "apigw-rest-v1": () => ({
    resource: "/items/{id}",
    path: "/items/42",
    httpMethod: "GET",
    headers: { Accept: "application/json" },
    multiValueHeaders: { Accept: ["application/json"] },
    queryStringParameters: null,
    pathParameters: { id: "42" },
    stageVariables: null,
    requestContext: {
      accountId: ACCOUNT,
      resourceId: "r1",
      stage: "prod",
      requestId: "req-1",
      identity: { sourceIp: "203.0.113.10", userAgent: "test" },
      resourcePath: "/items/{id}",
      httpMethod: "GET",
      apiId: "abc123",
      authorizer: { claims: { sub: "user-1" } },
    },
    body: null,
    isBase64Encoded: false,
  }),
  sqs: () => ({ Records: [sqsRecord(1, JSON.stringify({ orderId: "o-1", total: 10 }))] }),
  sns: () => ({
    Records: [
      {
        EventSource: "aws:sns",
        EventVersion: "1.0",
        EventSubscriptionArn: `arn:aws:sns:${REGION}:${ACCOUNT}:topic:sub-1`,
        Sns: {
          Type: "Notification",
          MessageId: "00000000-0000-4000-8000-000000000001",
          TopicArn: `arn:aws:sns:${REGION}:${ACCOUNT}:topic`,
          Subject: "subject",
          Message: JSON.stringify({ orderId: "o-1" }),
          Timestamp: "2026-01-01T00:00:00.000Z",
          SignatureVersion: "1",
          Signature: "EXAMPLE",
          SigningCertUrl: "https://sns.example.com/cert.pem",
          UnsubscribeUrl: "https://sns.example.com/unsubscribe",
          MessageAttributes: {},
        },
      },
    ],
  }),
  eventbridge: () => ({
    version: "0",
    id: "00000000-0000-4000-8000-000000000001",
    "detail-type": "OrderPlaced",
    source: "app.orders",
    account: ACCOUNT,
    time: "2026-01-01T00:00:00Z",
    region: REGION,
    resources: [],
    detail: { orderId: "o-1", total: 10 },
  }),
  "dynamodb-stream": () => ({
    Records: [
      {
        eventID: "1",
        eventName: "INSERT",
        eventVersion: "1.1",
        eventSource: "aws:dynamodb",
        awsRegion: REGION,
        dynamodb: {
          ApproximateCreationDateTime: 1767225600,
          Keys: { id: { S: "o-1" } },
          NewImage: { id: { S: "o-1" }, total: { N: "10" } },
          SequenceNumber: "111",
          SizeBytes: 26,
          StreamViewType: "NEW_AND_OLD_IMAGES",
        },
        eventSourceARN: `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/orders/stream/2026-01-01T00:00:00.000`,
      },
    ],
  }),
  s3: () => ({
    Records: [
      {
        eventVersion: "2.1",
        eventSource: "aws:s3",
        awsRegion: REGION,
        eventTime: "2026-01-01T00:00:00.000Z",
        eventName: "ObjectCreated:Put",
        userIdentity: { principalId: "AIDAEXAMPLE" },
        requestParameters: { sourceIPAddress: "203.0.113.10" },
        responseElements: { "x-amz-request-id": "REQ", "x-amz-id-2": "ID" },
        s3: {
          s3SchemaVersion: "1.0",
          configurationId: "config-1",
          bucket: {
            name: "landing-bucket",
            ownerIdentity: { principalId: "AIDAEXAMPLE" },
            arn: "arn:aws:s3:::landing-bucket",
          },
          object: {
            key: "incoming/file.csv",
            size: 1024,
            eTag: "0123456789abcdef",
            sequencer: "0A1B2C",
          },
        },
      },
    ],
  }),
  "stepfunctions-task": () => ({ orderId: "o-1", attempt: 1, executionName: "exec-1" }),
};

/** Variants that make a handler's error handling visible. */
export const VARIANTS: Record<Kind, Record<string, (base: Json) => Json>> = {
  "apigw-http-v2": {
    "no-auth": (e) => ({
      ...e,
      requestContext: { ...(e["requestContext"] as Json), authorizer: undefined },
    }),
    "missing-path-parameter": (e) => ({ ...e, pathParameters: undefined }),
    "malformed-body": (e) => ({
      ...e,
      routeKey: "POST /items",
      body: "{not json",
      requestContext: {
        ...(e["requestContext"] as Json),
        http: { ...((e["requestContext"] as Json)["http"] as Json), method: "POST" },
      },
    }),
    "base64-body": (e) => ({
      ...e,
      body: Buffer.from(JSON.stringify({ a: 1 })).toString("base64"),
      isBase64Encoded: true,
    }),
  },
  "apigw-rest-v1": {
    "no-auth": (e) => ({
      ...e,
      requestContext: { ...(e["requestContext"] as Json), authorizer: undefined },
    }),
    "malformed-body": (e) => ({ ...e, httpMethod: "POST", body: "{not json" }),
    "missing-path-parameter": (e) => ({ ...e, pathParameters: null }),
  },
  sqs: {
    "malformed-body": () => ({ Records: [sqsRecord(1, "{not json")] }),
    "empty-records": () => ({ Records: [] }),
    duplicate: () => ({
      Records: [
        sqsRecord(1, JSON.stringify({ orderId: "o-1" })),
        sqsRecord(1, JSON.stringify({ orderId: "o-1" })),
      ],
    }),
    "batch-one-bad": () => ({
      Records: [1, 2, 3, 4, 5].map((i) =>
        sqsRecord(i, i === 3 ? "{not json" : JSON.stringify({ orderId: `o-${i}` })),
      ),
    }),
    "large-batch": () => ({
      Records: Array.from({ length: 10 }, (_, i) =>
        sqsRecord(i + 1, JSON.stringify({ orderId: `o-${i + 1}` })),
      ),
    }),
    redelivered: () => ({
      Records: [
        {
          ...sqsRecord(1, JSON.stringify({ orderId: "o-1" })),
          attributes: {
            ApproximateReceiveCount: "4",
            SentTimestamp: "1767225600000",
            SenderId: "AIDAEXAMPLE",
            ApproximateFirstReceiveTimestamp: "1767225600005",
          },
        },
      ],
    }),
  },
  sns: {
    "malformed-message": (e) => ({
      Records: [
        {
          ...(e["Records"] as Json[])[0],
          Sns: { ...((e["Records"] as Json[])[0]?.["Sns"] as Json), Message: "{not json" },
        },
      ],
    }),
    "empty-records": () => ({ Records: [] }),
  },
  eventbridge: {
    "missing-detail": (e) => ({ ...e, detail: undefined }),
    "unknown-detail-type": (e) => ({ ...e, "detail-type": "SomethingElse" }),
    "extra-fields": (e) => ({
      ...e,
      detail: { ...(e["detail"] as Json), unexpected: { nested: [1, 2, 3] } },
    }),
  },
  "dynamodb-stream": {
    modify: (e) => ({ Records: [{ ...(e["Records"] as Json[])[0], eventName: "MODIFY" }] }),
    remove: (e) => {
      const record = (e["Records"] as Json[])[0] as Json;
      const rest: Json = { ...(record["dynamodb"] as Json) };
      delete rest["NewImage"];
      return {
        Records: [
          { ...record, eventName: "REMOVE", dynamodb: { ...rest, OldImage: { id: { S: "o-1" } } } },
        ],
      };
    },
    "empty-records": () => ({ Records: [] }),
  },
  s3: {
    delete: (e) => ({
      Records: [{ ...(e["Records"] as Json[])[0], eventName: "ObjectRemoved:Delete" }],
    }),
    "key-needs-decoding": (e) => {
      const record = (e["Records"] as Json[])[0] as Json;
      const s3 = record["s3"] as Json;
      return {
        Records: [
          {
            ...record,
            s3: { ...s3, object: { ...(s3["object"] as Json), key: "incoming/my+file%2B1.csv" } },
          },
        ],
      };
    },
  },
  "stepfunctions-task": {
    "missing-field": () => ({ attempt: 1 }),
    "wrong-type": () => ({ orderId: 42, attempt: "one" }),
  },
};

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

export function baseEvent(kind: Kind): Json {
  return BASE[kind]();
}

/** The event, or one of its variants. Undefined values are dropped, as they would be in JSON. */
export function fixture(kind: Kind, variant?: string): Json | null {
  const base = BASE[kind]();
  if (variant === undefined) return base;
  const make = VARIANTS[kind][variant];
  return make === undefined ? null : (JSON.parse(JSON.stringify(make(base))) as Json);
}

export function variantNames(kind: Kind): string[] {
  return Object.keys(VARIANTS[kind]);
}

export interface Validation {
  valid: boolean;
  problems: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The partial batch response of a Lambda SQS consumer using ReportBatchItemFailures. */
export function validateSqsBatchResponse(response: unknown, event?: Json): Validation {
  const problems: string[] = [];
  if (!isRecord(response))
    return {
      valid: false,
      problems: [
        "The response must be an object like { batchItemFailures: [...] }. Returning nothing makes the whole batch succeed; throwing makes it all fail.",
      ],
    };
  const failures = response["batchItemFailures"];
  if (!Array.isArray(failures))
    return {
      valid: false,
      problems: ["batchItemFailures must be a list (an empty list means every message succeeded)."],
    };
  const known = new Set(
    ((event?.["Records"] as Json[] | undefined) ?? []).map((record) => record["messageId"]),
  );
  for (const [index, entry] of failures.entries()) {
    if (!isRecord(entry) || typeof entry["itemIdentifier"] !== "string")
      problems.push(`batchItemFailures[${index}] must be { itemIdentifier: <messageId> }.`);
    else if (event !== undefined && !known.has(entry["itemIdentifier"]))
      problems.push(
        `batchItemFailures[${index}] names ${entry["itemIdentifier"]}, which is not in the batch.`,
      );
  }
  return { valid: problems.length === 0, problems };
}

/** The proxy response of an API Gateway HTTP API (payload 2.0) or REST API (proxy integration). */
export function validateHttpResponse(
  response: unknown,
  kind: "apigw-http-v2" | "apigw-rest-v1",
): Validation {
  const problems: string[] = [];
  if (!isRecord(response))
    return { valid: false, problems: ["The response must be an object with a statusCode."] };
  const status = response["statusCode"];
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599)
    problems.push("statusCode must be an integer from 100 to 599.");
  const body = response["body"];
  if (body !== undefined && typeof body !== "string")
    problems.push("body must be a string (use JSON.stringify for objects).");
  const headers = response["headers"];
  if (
    headers !== undefined &&
    (!isRecord(headers) ||
      Object.values(headers).some(
        (value) =>
          typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean",
      ))
  ) {
    problems.push("headers must map names to simple values.");
  }
  if (
    kind === "apigw-rest-v1" &&
    response["isBase64Encoded"] !== undefined &&
    typeof response["isBase64Encoded"] !== "boolean"
  )
    problems.push("isBase64Encoded must be a boolean.");
  return { valid: problems.length === 0, problems };
}

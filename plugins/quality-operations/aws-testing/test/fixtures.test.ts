import { describe, expect, it } from "vitest";

import {
  baseEvent,
  fixture,
  isKind,
  KINDS,
  validateHttpResponse,
  validateSqsBatchResponse,
  variantNames,
} from "../src/lib/fixtures.js";

type Json = Record<string, unknown>;

describe("event fixtures", () => {
  it.each(KINDS)("%s is JSON, uses placeholder ids only, and every variant is JSON too", (kind) => {
    const text = JSON.stringify(baseEvent(kind));
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toMatch(/AKIA[0-9A-Z]{16}/);
    for (const name of variantNames(kind)) {
      const variant = fixture(kind, name);
      expect(variant, `${kind}.${name}`).not.toBeNull();
      expect(() => JSON.stringify(variant)).not.toThrow();
    }
  });

  it("returns null for an unknown variant and recognizes kinds", () => {
    expect(fixture("sqs", "nope")).toBeNull();
    expect(isKind("sqs")).toBe(true);
    expect(isKind("kinesis")).toBe(false);
  });

  it("SQS records have the documented fields, a batch of one bad record, and a duplicate", () => {
    const event = baseEvent("sqs") as { Records: Json[] };
    expect(Object.keys(event.Records[0] as Json)).toEqual(
      expect.arrayContaining([
        "messageId",
        "receiptHandle",
        "body",
        "attributes",
        "eventSource",
        "eventSourceARN",
        "awsRegion",
      ]),
    );
    const mixed = fixture("sqs", "batch-one-bad") as { Records: Array<{ body: string }> };
    expect(mixed.Records).toHaveLength(5);
    expect(() => {
      JSON.parse(mixed.Records[2]?.body ?? "");
    }).toThrow();
    const duplicate = fixture("sqs", "duplicate") as { Records: Array<{ messageId: string }> };
    expect(duplicate.Records[0]?.messageId).toBe(duplicate.Records[1]?.messageId);
    expect(
      (
        fixture("sqs", "redelivered") as {
          Records: Array<{ attributes: { ApproximateReceiveCount: string } }>;
        }
      ).Records[0]?.attributes.ApproximateReceiveCount,
    ).toBe("4");
  });

  it("API Gateway events carry the authorizer claims, and the no-auth variant removes them", () => {
    const http = baseEvent("apigw-http-v2") as {
      version: string;
      requestContext: { authorizer?: unknown };
    };
    expect(http.version).toBe("2.0");
    expect(http.requestContext.authorizer).toBeDefined();
    expect(
      (fixture("apigw-http-v2", "no-auth") as { requestContext: { authorizer?: unknown } })
        .requestContext.authorizer,
    ).toBeUndefined();
    expect(
      (fixture("apigw-http-v2", "base64-body") as { isBase64Encoded: boolean }).isBase64Encoded,
    ).toBe(true);
    expect((baseEvent("apigw-rest-v1") as { httpMethod: string }).httpMethod).toBe("GET");
  });

  it("covers the other sources", () => {
    expect(baseEvent("eventbridge")["detail-type"]).toBe("OrderPlaced");
    expect(
      (
        (baseEvent("sns") as { Records: Array<{ Sns: { Type: string } }> }).Records[0] as {
          Sns: { Type: string };
        }
      ).Sns.Type,
    ).toBe("Notification");
    expect(
      ((baseEvent("dynamodb-stream") as { Records: Json[] }).Records[0] as Json)["eventName"],
    ).toBe("INSERT");
    const removal =
      (fixture("dynamodb-stream", "remove") as { Records: Array<{ dynamodb: Json }> }).Records[0]
        ?.dynamodb ?? {};
    expect(removal["NewImage"]).toBeUndefined();
    expect(removal["OldImage"]).toBeDefined();
    const key = (
      fixture("s3", "key-needs-decoding") as { Records: Array<{ s3: { object: { key: string } } }> }
    ).Records[0]?.s3.object.key;
    expect(key).toBe("incoming/my+file%2B1.csv");
  });
});

describe("validateSqsBatchResponse", () => {
  const event = fixture("sqs", "batch-one-bad") as Json;
  const ids = (event["Records"] as Array<{ messageId: string }>).map((record) => record.messageId);

  it("accepts an empty list and a list naming records of the batch", () => {
    expect(validateSqsBatchResponse({ batchItemFailures: [] }, event).valid).toBe(true);
    expect(
      validateSqsBatchResponse({ batchItemFailures: [{ itemIdentifier: ids[2] }] }, event).valid,
    ).toBe(true);
  });

  it.each([[undefined], [null], [[]], ["ok"], [{}], [{ batchItemFailures: "x" }]])(
    "rejects %j",
    (response) => {
      expect(validateSqsBatchResponse(response, event).valid).toBe(false);
    },
  );

  it("rejects entries that are malformed or name a record that is not in the batch", () => {
    expect(
      validateSqsBatchResponse({ batchItemFailures: [{ id: "x" }] }, event).problems[0],
    ).toContain("itemIdentifier");
    expect(
      validateSqsBatchResponse({ batchItemFailures: [{ itemIdentifier: "not-in-batch" }] }, event)
        .problems[0],
    ).toContain("not in the batch");
  });
});

describe("validateHttpResponse", () => {
  it("accepts a proxy response and rejects the common mistakes", () => {
    expect(
      validateHttpResponse(
        { statusCode: 200, body: "{}", headers: { "content-type": "application/json" } },
        "apigw-http-v2",
      ).valid,
    ).toBe(true);
    expect(
      validateHttpResponse({ statusCode: 200, body: { a: 1 } }, "apigw-http-v2").problems[0],
    ).toContain("JSON.stringify");
    expect(validateHttpResponse({ statusCode: "200" }, "apigw-rest-v1").valid).toBe(false);
    expect(validateHttpResponse({ statusCode: 700 }, "apigw-http-v2").valid).toBe(false);
    expect(
      validateHttpResponse({ statusCode: 200, headers: { a: { b: 1 } } }, "apigw-http-v2").valid,
    ).toBe(false);
    expect(
      validateHttpResponse({ statusCode: 200, isBase64Encoded: "yes" }, "apigw-rest-v1").valid,
    ).toBe(false);
    expect(validateHttpResponse(undefined, "apigw-http-v2").valid).toBe(false);
  });
});

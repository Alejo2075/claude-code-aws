export const EVENTS = ["sqs", "apigw-http", "eventbridge", "s3", "sns", "scheduled"] as const;
export type EventKind = (typeof EVENTS)[number];
export const NAME = /^[a-z][a-z0-9-]{0,40}$/;

const PARSE: Record<EventKind, { type: string; body: string; sample: unknown }> = {
  sqs: {
    type: "SQSEvent",
    body: `  // Each record is processed on its own. Failures are reported per message so good messages are not retried.\n  const failures: { itemIdentifier: string }[] = [];\n  for (const record of event.Records) {\n    try {\n      const message = parseMessage(record.body);\n      await handleMessage(message, ctx);\n    } catch (error) {\n      log.error("message failed", { messageId: record.messageId, error: describe(error) });\n      failures.push({ itemIdentifier: record.messageId });\n    }\n  }\n  return { batchItemFailures: failures };`,
    sample: { Records: [{ messageId: "m-1", body: JSON.stringify({ id: "x-1" }) }] },
  },
  "apigw-http": {
    type: "APIGatewayProxyEventV2",
    body: `  try {\n    const input = parseMessage(event.body ?? "");\n    const result = await handleMessage(input, ctx);\n    return json(200, result);\n  } catch (error) {\n    if (error instanceof ValidationError) return json(400, { message: error.message });\n    log.error("request failed", { error: describe(error) });\n    return json(500, { message: "internal error" });\n  }`,
    sample: {
      version: "2.0",
      routeKey: "POST /items",
      body: JSON.stringify({ id: "x-1" }),
      headers: {},
    },
  },
  eventbridge: {
    type: "EventBridgeEvent<string, unknown>",
    body: `  const message = parseMessage(JSON.stringify(event.detail));\n  await handleMessage(message, ctx);`,
    sample: { "detail-type": "ItemCreated.v1", source: "app.items", detail: { id: "x-1" } },
  },
  s3: {
    type: "S3Event",
    body: `  for (const record of event.Records) {\n    // Object keys arrive URL-encoded; decode them, and never use one as a file path.\n    const key = decodeURIComponent(record.s3.object.key.replace(/\\+/g, " "));\n    await handleMessage({ id: key }, ctx);\n  }`,
    sample: { Records: [{ s3: { bucket: { name: "b" }, object: { key: "in/a.json" } } }] },
  },
  sns: {
    type: "SNSEvent",
    body: `  for (const record of event.Records) {\n    const message = parseMessage(record.Sns.Message);\n    await handleMessage(message, ctx);\n  }`,
    sample: { Records: [{ Sns: { Message: JSON.stringify({ id: "x-1" }) } }] },
  },
  scheduled: {
    type: "ScheduledEvent",
    body: `  await handleMessage({ id: event.id }, ctx);`,
    sample: { id: "run-1", "detail-type": "Scheduled Event", source: "aws.scheduler" },
  },
};

export interface Scaffold {
  files: Array<{ path: string; content: string }>;
}

/** A handler that separates the entry point from the business logic, validates its input, logs as JSON, and leaves a hook for idempotency. */
export function scaffold(name: string, kind: EventKind): Scaffold {
  const p = PARSE[kind];
  const handler = `// ${name}: entry point. Keep it thin; the logic lives in handleMessage so it can be tested without AWS.
import type { Context${kind === "sqs" ? ", SQSEvent" : kind === "apigw-http" ? ", APIGatewayProxyEventV2" : kind === "eventbridge" ? ", EventBridgeEvent" : kind === "s3" ? ", S3Event" : kind === "sns" ? ", SNSEvent" : ", ScheduledEvent"} } from "aws-lambda";

export class ValidationError extends Error {}

export interface Message {
  id: string;
}

/** Dependencies are passed in, so tests can replace them and the SDK clients are created once per container. */
export interface Deps {
  /** Return true if this id was already handled. Back it with a conditional write (for example DynamoDB attribute_not_exists). */
  alreadyHandled: (id: string) => Promise<boolean>;
}

const log = {
  info: (message: string, fields: Record<string, unknown> = {}): void => console.log(JSON.stringify({ level: "info", message, ...fields })),
  error: (message: string, fields: Record<string, unknown> = {}): void => console.error(JSON.stringify({ level: "error", message, ...fields })),
};

const describe = (error: unknown): string => (error instanceof Error ? error.name : "UnknownError");

export function parseMessage(text: string): Message {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ValidationError("the body is not valid JSON");
  }
  if (typeof value !== "object" || value === null || typeof (value as { id?: unknown }).id !== "string" || (value as { id: string }).id === "")
    throw new ValidationError("id is required");
  return { id: (value as { id: string }).id };
}

${kind === "apigw-http" ? 'const json = (statusCode: number, body: unknown): { statusCode: number; headers: Record<string, string>; body: string } => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });\n' : ""}
export async function handleMessage(message: Message, ctx: { deps: Deps }): Promise<{ processed: boolean }> {
  if (await ctx.deps.alreadyHandled(message.id)) {
    log.info("duplicate ignored", { id: message.id });
    return { processed: false };
  }
  // TODO: the business logic goes here.
  log.info("handled", { id: message.id });
  return { processed: true };
}

// Replace this with a real implementation (a conditional DynamoDB write is the usual choice).
const deps: Deps = { alreadyHandled: () => Promise.resolve(false) };

export const handler = async (event: ${p.type}, _context: Context): Promise<${kind === "sqs" ? "{ batchItemFailures: { itemIdentifier: string }[] }" : kind === "apigw-http" ? "{ statusCode: number; headers: Record<string, string>; body: string }" : "void"}> => {
  const ctx = { deps };
${p.body}
};
`;
  const test = `// Runs with the Node test runner: node --test --experimental-strip-types src/handlers/${name}.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { handleMessage, parseMessage } from "./${name}.ts";

test("parseMessage rejects bad input", () => {
  assert.throws(() => parseMessage("not json"));
  assert.throws(() => parseMessage("{}"));
});

test("a duplicate is ignored and a new message is processed", async () => {
  const seen = new Set<string>();
  const deps = { alreadyHandled: (id: string) => Promise.resolve(seen.has(id) || (seen.add(id), false)) };
  assert.deepEqual(await handleMessage({ id: "a" }, { deps }), { processed: true });
  assert.deepEqual(await handleMessage({ id: "a" }, { deps }), { processed: false });
});
`;
  const local = `// Local harness: runs the handler once with the sample event. It does NOT call Lambda or AWS.
// Run it yourself:  node --experimental-strip-types src/handlers/${name}.local.ts
import { readFileSync } from "node:fs";

import { handler } from "./${name}.ts";

const event = JSON.parse(readFileSync(new URL("./${name}.event.json", import.meta.url), "utf8"));
const result = await handler(event, {} as never);
console.log("local result (not a Lambda invocation):", JSON.stringify(result));
`;
  return {
    files: [
      { path: `src/handlers/${name}.ts`, content: handler },
      { path: `src/handlers/${name}.test.ts`, content: test },
      { path: `src/handlers/${name}.local.ts`, content: local },
      {
        path: `src/handlers/${name}.event.json`,
        content: `${JSON.stringify(p.sample, null, 2)}\n`,
      },
    ],
  };
}

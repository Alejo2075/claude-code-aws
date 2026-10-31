// A monthly estimate from stated inputs and dated list prices. It is an estimate: nothing here reads
// a bill, and every line says what it assumed. It never claims to be what AWS will invoice.
import type { CostEstimate, CostLine } from "@claude-code-aws/report-contract";

import { PRICE_NOTE, PRICE_REGION, priceOf, rateDate, tieredCost } from "./prices.js";

export interface WorkloadInput {
  lambda?: {
    requestsPerMonth: number;
    avgDurationMs: number;
    memoryMb: number;
    arch?: "x86" | "arm";
    retryRate?: number;
  };
  apiGateway?: { kind: "http" | "rest"; requestsPerMonth: number };
  dynamodb?: { readRequestUnitsPerMonth?: number; writeRequestUnitsPerMonth?: number };
  sqs?: { requestsPerMonth: number };
  sns?: { requestsPerMonth: number };
  stepFunctions?: { standardTransitionsPerMonth: number };
  logs?: { ingestGbPerMonth: number; storedGb?: number };
}

const NUMBER_LIMIT = 1e13;
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= NUMBER_LIMIT;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks the shape of an input document. Returns the problems, empty when it is acceptable. */
export function validateWorkload(value: unknown): {
  input: WorkloadInput | null;
  problems: string[];
} {
  const problems: string[] = [];
  if (!isRecord(value)) return { input: null, problems: ["The workload must be a JSON object."] };
  const known = ["lambda", "apiGateway", "dynamodb", "sqs", "sns", "stepFunctions", "logs"];
  for (const key of Object.keys(value))
    if (!known.includes(key)) problems.push(`Unknown section "${key}".`);
  const need = (
    section: string,
    record: unknown,
    fields: string[],
    optional: string[] = [],
  ): record is Record<string, unknown> => {
    if (!isRecord(record)) {
      problems.push(`${section} must be an object.`);
      return false;
    }
    for (const field of fields)
      if (!isCount(record[field]))
        problems.push(`${section}.${field} must be a number from 0 to ${NUMBER_LIMIT}.`);
    for (const field of optional)
      if (record[field] !== undefined && !isCount(record[field]))
        problems.push(`${section}.${field} must be a number from 0 to ${NUMBER_LIMIT}.`);
    return true;
  };
  if (
    value["lambda"] !== undefined &&
    need(
      "lambda",
      value["lambda"],
      ["requestsPerMonth", "avgDurationMs", "memoryMb"],
      ["retryRate"],
    )
  ) {
    const l = value["lambda"];
    if (isCount(l["memoryMb"]) && (l["memoryMb"] < 128 || l["memoryMb"] > 10240))
      problems.push("lambda.memoryMb must be from 128 to 10240.");
    if (l["arch"] !== undefined && l["arch"] !== "x86" && l["arch"] !== "arm")
      problems.push('lambda.arch must be "x86" or "arm".');
    if (isCount(l["retryRate"]) && l["retryRate"] > 10)
      problems.push(
        "lambda.retryRate is the extra invocations per request (0.1 = 10%), at most 10.",
      );
  }
  if (
    value["apiGateway"] !== undefined &&
    need("apiGateway", value["apiGateway"], ["requestsPerMonth"])
  ) {
    const kind = value["apiGateway"]["kind"];
    if (kind !== "http" && kind !== "rest")
      problems.push('apiGateway.kind must be "http" or "rest".');
  }
  if (value["dynamodb"] !== undefined)
    need(
      "dynamodb",
      value["dynamodb"],
      [],
      ["readRequestUnitsPerMonth", "writeRequestUnitsPerMonth"],
    );
  if (value["sqs"] !== undefined) need("sqs", value["sqs"], ["requestsPerMonth"]);
  if (value["sns"] !== undefined) need("sns", value["sns"], ["requestsPerMonth"]);
  if (value["stepFunctions"] !== undefined)
    need("stepFunctions", value["stepFunctions"], ["standardTransitionsPerMonth"]);
  if (value["logs"] !== undefined) need("logs", value["logs"], ["ingestGbPerMonth"], ["storedGb"]);
  return problems.length > 0 ? { input: null, problems } : { input: value, problems: [] };
}

const round = (value: number): number => Math.round(value * 100) / 100;

export const EXCLUSIONS = [
  "Free tier, credits, savings plans, enterprise discounts, and tax: none are applied. The list prices are on-demand.",
  "Data transfer, NAT gateways, KMS, X-Ray, CloudWatch metrics, alarms and dashboards, Secrets Manager, and support plans.",
  "S3, EventBridge, AppSync, Cognito, and any other service not listed in the lines.",
  "Costs of retries and duplicate events beyond the retry rate you gave, and of failed or throttled requests.",
];

/** Monthly estimate for one workload. Throws nothing: validate the input first. */
export function estimateWorkload(input: WorkloadInput, now: Date = new Date()): CostEstimate {
  const lines: CostLine[] = [];
  const assumptions: string[] = [];
  const keys: string[] = [];
  const line = (
    key: string,
    service: string,
    description: string,
    quantity: number,
    unit: string,
  ): void => {
    const item = priceOf(key);
    keys.push(key);
    const { total, averagePrice } = tieredCost(item, quantity);
    lines.push({
      service,
      description,
      quantity: round(quantity),
      unit,
      unitPrice: Number(averagePrice.toPrecision(6)),
      monthly: round(total),
    });
  };
  if (input.lambda !== undefined) {
    const { requestsPerMonth, avgDurationMs, memoryMb, arch = "x86", retryRate = 0 } = input.lambda;
    const invocations = requestsPerMonth * (1 + retryRate);
    // Lambda bills duration in milliseconds at the configured memory.
    const gbSeconds = invocations * (avgDurationMs / 1000) * (memoryMb / 1024);
    line(
      `lambda.request.${arch}`,
      "Lambda",
      `${Math.round(invocations)} invocations (${requestsPerMonth} requests${retryRate > 0 ? ` plus ${Math.round(retryRate * 100)}% retries` : ""})`,
      invocations,
      "request",
    );
    line(
      `lambda.compute.${arch}`,
      "Lambda",
      `${memoryMb} MB for ${avgDurationMs} ms on average (${arch})`,
      gbSeconds,
      "GB-second",
    );
    assumptions.push(
      `Lambda: ${requestsPerMonth} requests/month, ${avgDurationMs} ms average billed duration, ${memoryMb} MB, ${arch}, retry rate ${retryRate}. The duration is an input you supply: measure it, because it depends on the memory setting.`,
    );
  }
  if (input.apiGateway !== undefined) {
    line(
      `apigw.${input.apiGateway.kind}`,
      "API Gateway",
      `${input.apiGateway.kind.toUpperCase()} API requests`,
      input.apiGateway.requestsPerMonth,
      "request",
    );
    assumptions.push(
      `API Gateway: ${input.apiGateway.kind.toUpperCase()} API, ${input.apiGateway.requestsPerMonth} requests/month, no caching, no data transfer.`,
    );
  }
  if (input.dynamodb !== undefined) {
    const { readRequestUnitsPerMonth: reads = 0, writeRequestUnitsPerMonth: writes = 0 } =
      input.dynamodb;
    if (reads > 0)
      line("dynamodb.read", "DynamoDB", "On-demand read request units", reads, "read request unit");
    if (writes > 0)
      line(
        "dynamodb.write",
        "DynamoDB",
        "On-demand write request units",
        writes,
        "write request unit",
      );
    assumptions.push(
      `DynamoDB: on-demand, ${reads} read and ${writes} write request units/month (a 1 KB write is 1 unit, a 4 KB strongly consistent read is 1 unit). Storage, backups, streams, and global tables are not included.`,
    );
  }
  if (input.sqs !== undefined) {
    line("sqs.standard", "SQS", "Standard queue requests", input.sqs.requestsPerMonth, "request");
    assumptions.push(
      `SQS: standard queue, ${input.sqs.requestsPerMonth} requests/month. Each message needs at least three requests (send, receive, delete), and long polling adds empty receives.`,
    );
  }
  if (input.sns !== undefined) {
    line("sns.request", "SNS", "API requests", input.sns.requestsPerMonth, "request");
    assumptions.push(
      `SNS: ${input.sns.requestsPerMonth} publish requests/month, delivery to SQS and Lambda subscribers at no extra request charge; other protocols are not included.`,
    );
  }
  if (input.stepFunctions !== undefined) {
    line(
      "stepfunctions.standard",
      "Step Functions",
      "Standard workflow state transitions",
      input.stepFunctions.standardTransitionsPerMonth,
      "state transition",
    );
    assumptions.push(
      `Step Functions: Standard workflows, ${input.stepFunctions.standardTransitionsPerMonth} transitions/month. Express workflows are priced differently and are not estimated.`,
    );
  }
  if (input.logs !== undefined) {
    line(
      "logs.ingest",
      "CloudWatch Logs",
      "Ingestion (Standard class)",
      input.logs.ingestGbPerMonth,
      "GB",
    );
    if ((input.logs.storedGb ?? 0) > 0)
      line("logs.storage", "CloudWatch Logs", "Storage", input.logs.storedGb ?? 0, "GB-month");
    assumptions.push(
      `CloudWatch Logs: ${input.logs.ingestGbPerMonth} GB ingested/month, ${input.logs.storedGb ?? 0} GB stored. Retention decides how much is stored.`,
    );
  }
  const total = round(lines.reduce((sum, entry) => sum + entry.monthly, 0));
  return {
    schemaVersion: "1",
    plugin: "aws-cost",
    generatedAt: now.toISOString(),
    kind: "estimated",
    currency: "USD",
    region: PRICE_REGION,
    rateDate: rateDate(keys),
    assumptions,
    exclusions: EXCLUSIONS,
    lines,
    totalMonthly: total,
    limitations: [
      `${PRICE_NOTE} Only us-east-1 is available; other regions differ.`,
      "This is an estimate from the inputs you gave, not a forecast of your invoice and not billed spending. Compare it with Cost Explorer once the workload runs.",
    ],
  };
}

/** Totals at several volumes, so the reader sees how sensitive the estimate is. */
export function sensitivity(
  input: WorkloadInput,
  factors: readonly number[] = [0.5, 1, 2, 5, 10],
): Array<{ factor: number; totalMonthly: number }> {
  const scale = (value: number | undefined): number | undefined => value;
  return factors.map((factor) => {
    const scaled: WorkloadInput = {
      ...(input.lambda === undefined
        ? {}
        : {
            lambda: { ...input.lambda, requestsPerMonth: input.lambda.requestsPerMonth * factor },
          }),
      ...(input.apiGateway === undefined
        ? {}
        : {
            apiGateway: {
              ...input.apiGateway,
              requestsPerMonth: input.apiGateway.requestsPerMonth * factor,
            },
          }),
      ...(input.dynamodb === undefined
        ? {}
        : {
            dynamodb: {
              readRequestUnitsPerMonth:
                (scale(input.dynamodb.readRequestUnitsPerMonth) ?? 0) * factor,
              writeRequestUnitsPerMonth:
                (scale(input.dynamodb.writeRequestUnitsPerMonth) ?? 0) * factor,
            },
          }),
      ...(input.sqs === undefined
        ? {}
        : { sqs: { requestsPerMonth: input.sqs.requestsPerMonth * factor } }),
      ...(input.sns === undefined
        ? {}
        : { sns: { requestsPerMonth: input.sns.requestsPerMonth * factor } }),
      ...(input.stepFunctions === undefined
        ? {}
        : {
            stepFunctions: {
              standardTransitionsPerMonth: input.stepFunctions.standardTransitionsPerMonth * factor,
            },
          }),
      ...(input.logs === undefined
        ? {}
        : {
            logs: {
              ingestGbPerMonth: input.logs.ingestGbPerMonth * factor,
              ...(input.logs.storedGb === undefined
                ? {}
                : { storedGb: input.logs.storedGb * factor }),
            },
          }),
    };
    return { factor, totalMonthly: estimateWorkload(scaled).totalMonthly };
  });
}

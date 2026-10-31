import {
  iamStatements,
  isRetained,
  resourcesOfType,
  runtimeStatus,
  type Template,
} from "@claude-code-aws/template-analysis";

import type { TemplateAnswer, TemplateResult } from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const ratio = (ok: number, total: number): TemplateAnswer =>
  total === 0 ? "not-in-template" : ok === total ? "yes" : ok === 0 ? "no" : "partly";

export const count = (ok: number, total: number, what: string): string =>
  total === 0 ? "nothing of this kind in the template" : `${ok} of ${total} ${what}`;

const firstGetAtt = (value: unknown): string =>
  JSON.stringify(value).match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ?? "";
const firstRef = (value: unknown): string =>
  JSON.stringify(value).match(/"Ref":"([^"]+)"/)?.[1] ?? "";

export const dlq = (t: Template): TemplateResult => {
  const queues = resourcesOfType(t, "AWS::SQS::Queue");
  const targets = new Set(
    queues.flatMap((q) =>
      isRecord(q.properties["RedrivePolicy"]) ? [firstGetAtt(q.properties["RedrivePolicy"])] : [],
    ),
  );
  const sources = queues.filter((q) => !targets.has(q.logicalId));
  const ok = sources.filter((q) => q.properties["RedrivePolicy"] !== undefined).length;
  return {
    answer: ratio(ok, sources.length),
    evidence: count(ok, sources.length, "source queues have a redrive policy"),
  };
};

export const visibility = (t: Template): TemplateResult => {
  let ok = 0;
  let total = 0;
  for (const mapping of resourcesOfType(t, "AWS::Lambda::EventSourceMapping")) {
    const queue = t.resources[firstGetAtt(mapping.properties["EventSourceArn"])];
    const fn = t.resources[firstRef(mapping.properties["FunctionName"])];
    if (queue?.type !== "AWS::SQS::Queue" || fn === undefined) continue;
    total += 1;
    const v =
      typeof queue.properties["VisibilityTimeout"] === "number"
        ? queue.properties["VisibilityTimeout"]
        : 30;
    const timeout = typeof fn.properties["Timeout"] === "number" ? fn.properties["Timeout"] : 3;
    if (v >= timeout * 6) ok += 1;
  }
  return {
    answer: ratio(ok, total),
    evidence: count(ok, total, "queue-to-function links meet the six-times guideline"),
  };
};

export const tracing = (t: Template): TemplateResult => {
  const fns = resourcesOfType(t, "AWS::Lambda::Function");
  const ok = fns.filter(
    (f) =>
      isRecord(f.properties["TracingConfig"]) && f.properties["TracingConfig"]["Mode"] === "Active",
  ).length;
  return {
    answer: ratio(ok, fns.length),
    evidence: count(ok, fns.length, "functions have active tracing"),
  };
};

export const alarms = (t: Template): TemplateResult => {
  const n = resourcesOfType(t, "AWS::CloudWatch::Alarm").length;
  const watched = resourcesOfType(t, "AWS::Lambda::Function", "AWS::SQS::Queue").length;
  return {
    answer: watched === 0 ? "not-in-template" : n === 0 ? "no" : "partly",
    evidence: `${n} alarm(s) for ${watched} function(s) and queue(s). Whether they cover the right signals needs a reading of their definitions.`,
  };
};

export const logRetention = (t: Template): TemplateResult => {
  const groups = resourcesOfType(t, "AWS::Logs::LogGroup");
  const ok = groups.filter((g) => g.properties["RetentionInDays"] !== undefined).length;
  return groups.length === 0
    ? {
        answer: "no",
        evidence:
          "No log group is defined in the template, so each function's log group is created by Lambda and never expires.",
      }
    : {
        answer: ratio(ok, groups.length),
        evidence: count(ok, groups.length, "log groups set a retention period"),
      };
};

export const authorizer = (t: Template): TemplateResult => {
  const routes = resourcesOfType(t, "AWS::ApiGatewayV2::Route");
  const methods = resourcesOfType(t, "AWS::ApiGateway::Method").filter(
    (m) => m.properties["HttpMethod"] !== "OPTIONS",
  );
  const total = routes.length + methods.length;
  const ok = [...routes, ...methods].filter(
    (r) => (r.properties["AuthorizationType"] ?? "NONE") !== "NONE",
  ).length;
  return {
    answer: ratio(ok, total),
    evidence: `${count(ok, total, "routes have an authorizer")}. Whether the handler checks that this caller may touch this data (tenant isolation) is not visible in a template.`,
  };
};

export const leastPrivilege = (t: Template): TemplateResult => {
  const allows = iamStatements(t).filter((s) => s.effect === "Allow" && s.kind === "identity");
  const broad = allows.filter(
    (s) =>
      s.actions.includes("*") ||
      s.actions.some((a) => a.endsWith(":*")) ||
      (s.resources.includes("*") && !s.actions.every((a) => /^(xray|logs):/.test(a))),
  ).length;
  return {
    answer:
      allows.length === 0
        ? "not-in-template"
        : broad === 0
          ? "yes"
          : broad === allows.length
            ? "no"
            : "partly",
    evidence: `${broad} of ${allows.length} allow statements use a wildcard action or an unrestricted resource.`,
  };
};

export const publicAccess = (t: Template): TemplateResult => {
  const buckets = resourcesOfType(t, "AWS::S3::Bucket");
  const ok = buckets.filter((b) => {
    const cfg = b.properties["PublicAccessBlockConfiguration"];
    return isRecord(cfg) && Object.values(cfg).every((v) => v === true);
  }).length;
  return {
    answer: ratio(ok, buckets.length),
    evidence: count(ok, buckets.length, "buckets block public access"),
  };
};

export const topicEncryption = (t: Template): TemplateResult => {
  const topics = resourcesOfType(t, "AWS::SNS::Topic");
  const ok = topics.filter((x) => x.properties["KmsMasterKeyId"] !== undefined).length;
  return {
    answer: ratio(ok, topics.length),
    evidence: count(ok, topics.length, "topics set a KMS key"),
  };
};

export const tableBackups = (t: Template): TemplateResult => {
  const tables = resourcesOfType(t, "AWS::DynamoDB::Table");
  const ok = tables.filter((x) => {
    const spec = x.properties["PointInTimeRecoverySpecification"];
    return isRecord(spec) && spec["PointInTimeRecoveryEnabled"] === true;
  }).length;
  return {
    answer: ratio(ok, tables.length),
    evidence: count(ok, tables.length, "tables enable point-in-time recovery"),
  };
};

export const retainState = (t: Template): TemplateResult => {
  const stateful = resourcesOfType(
    t,
    "AWS::DynamoDB::Table",
    "AWS::S3::Bucket",
    "AWS::Kinesis::Stream",
  );
  const ok = stateful.filter(isRetained).length;
  return {
    answer: ratio(ok, stateful.length),
    evidence: count(
      ok,
      stateful.length,
      "stateful resources keep a Retain policy when the stack deletes them",
    ),
  };
};

export const arm64 = (t: Template): TemplateResult => {
  const fns = resourcesOfType(t, "AWS::Lambda::Function");
  const ok = fns.filter(
    (f) =>
      Array.isArray(f.properties["Architectures"]) &&
      f.properties["Architectures"].includes("arm64"),
  ).length;
  return {
    answer: ratio(ok, fns.length),
    evidence: count(ok, fns.length, "functions run on arm64"),
  };
};

export const runtimes = (t: Template, now: Date): TemplateResult => {
  const fns = resourcesOfType(t, "AWS::Lambda::Function").filter(
    (f) => typeof f.properties["Runtime"] === "string",
  );
  const bad = fns.filter((f) => {
    const state = runtimeStatus(String(f.properties["Runtime"]), now).state;
    return state === "deprecated" || state === "approaching";
  }).length;
  return {
    answer:
      fns.length === 0
        ? "not-in-template"
        : bad === 0
          ? "yes"
          : bad === fns.length
            ? "no"
            : "partly",
    evidence: `${bad} of ${fns.length} functions use a runtime that is deprecated or approaching deprecation (table dated in template-analysis).`,
  };
};

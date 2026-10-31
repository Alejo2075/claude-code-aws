import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import {
  resourcesOfType,
  type ResourceInfo,
  type Template,
} from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-messaging";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const target = (v: unknown): string =>
  JSON.stringify(v).match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ??
  JSON.stringify(v).match(/"Ref":"([^"]+)"/)?.[1] ??
  "";
const text = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "?";
const num = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

const isFifo = (r: ResourceInfo): boolean =>
  r.properties["FifoQueue"] === true || r.properties["FifoTopic"] === true;

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const q of resourcesOfType(t, "AWS::SQS::Queue")) {
    const redrive = isRecord(q.properties["RedrivePolicy"])
      ? `, DLQ after ${text(q.properties["RedrivePolicy"]["maxReceiveCount"])} receives`
      : "";
    rows.push({
      kind: "queue",
      id: `${stack}/${q.logicalId}`,
      detail: `${isFifo(q) ? "FIFO" : "standard"}, visibility ${num(q.properties["VisibilityTimeout"], 30)}s, retention ${num(q.properties["MessageRetentionPeriod"], 345600)}s${redrive}`,
    });
  }
  for (const x of resourcesOfType(t, "AWS::SNS::Topic"))
    rows.push({
      kind: "topic",
      id: `${stack}/${x.logicalId}`,
      detail: `${isFifo(x) ? "FIFO" : "standard"}${x.properties["KmsMasterKeyId"] === undefined ? ", not encrypted with a KMS key" : ", KMS key set"}`,
    });
  for (const s of resourcesOfType(t, "AWS::SNS::Subscription"))
    rows.push({
      kind: "subscription",
      id: `${stack}/${s.logicalId}`,
      detail: `${text(s.properties["Protocol"])}${s.properties["FilterPolicy"] === undefined ? ", no filter" : ", filtered"}${s.properties["RawMessageDelivery"] === true ? ", raw" : ""}`,
    });
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  const queues = resourcesOfType(t, "AWS::SQS::Queue");
  const dlqIds = new Set(
    queues.flatMap((q) =>
      isRecord(q.properties["RedrivePolicy"])
        ? [target(q.properties["RedrivePolicy"]["deadLetterTargetArn"])]
        : [],
    ),
  );
  for (const q of queues) {
    const redrive = q.properties["RedrivePolicy"];
    const isDlq = dlqIds.has(q.logicalId);
    if (!isDlq && !isRecord(redrive))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-NO-DLQ",
          severity: "medium",
          title: "Queue has no dead-letter queue",
          explanation:
            "A message that keeps failing is retried until it expires and is then lost, without a copy to inspect.",
          subject: at(q.logicalId),
          resources: [at(q.logicalId)],
          recommendation: "Add a redrive policy to a dead-letter queue and alarm on its depth.",
        }),
      );
    if (isRecord(redrive)) {
      const dlq = queues.find((x) => x.logicalId === target(redrive["deadLetterTargetArn"]));
      if (
        dlq !== undefined &&
        num(dlq.properties["MessageRetentionPeriod"], 345600) <
          num(q.properties["MessageRetentionPeriod"], 345600)
      )
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "MSG-DLQ-RETENTION",
            severity: "medium",
            title: "Dead-letter queue keeps messages for less time than the source queue",
            explanation:
              "A message keeps the age of its original enqueue time when it moves to the dead-letter queue, so a shorter retention there can expire messages almost immediately.",
            subject: at(q.logicalId),
            resources: [at(q.logicalId), at(dlq.logicalId)],
            recommendation: "Set the dead-letter queue retention to at least the source queue's.",
          }),
        );
      if (redrive["maxReceiveCount"] === 1)
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "MSG-MAXRECEIVE-ONE",
            severity: "low",
            title: "A single failed receive sends the message to the dead-letter queue",
            explanation:
              "One transient error (a timeout, a throttle) dead-letters the message. Most consumers want a few attempts.",
            subject: at(q.logicalId),
            resources: [at(q.logicalId)],
          }),
        );
    }
    if (
      isFifo(q) &&
      typeof q.properties["QueueName"] === "string" &&
      !q.properties["QueueName"].endsWith(".fifo")
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-FIFO-NAME",
          severity: "high",
          title: "FIFO queue name does not end in .fifo",
          explanation:
            "SQS requires FIFO queue names to end with .fifo; the stack would fail to create.",
          subject: at(q.logicalId),
          resources: [at(q.logicalId)],
        }),
      );
    if (isFifo(q) && q.properties["ContentBasedDeduplication"] !== true)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-FIFO-DEDUP-ID",
          severity: "info",
          title: "FIFO queue needs a deduplication id on every send",
          explanation:
            "Without content-based deduplication, each SendMessage must carry a MessageDeduplicationId, and a MessageGroupId is always required.",
          subject: at(q.logicalId),
          resources: [at(q.logicalId)],
        }),
      );
    if (num(q.properties["ReceiveMessageWaitTimeSeconds"], 0) === 0 && !isDlq)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-NO-LONG-POLLING",
          severity: "low",
          title: "Queue uses short polling by default",
          explanation:
            "Short polling returns immediately and is billed per request, including the many empty responses. Lambda event sources poll for you; custom consumers should use long polling.",
          subject: at(q.logicalId),
          resources: [at(q.logicalId)],
          recommendation: "Set ReceiveMessageWaitTimeSeconds to 20 if a custom consumer reads it.",
        }),
      );
  }
  for (const m of resourcesOfType(t, "AWS::Lambda::EventSourceMapping")) {
    const q = queues.find((x) => x.logicalId === target(m.properties["EventSourceArn"]));
    const fn = t.resources[target(m.properties["FunctionName"])];
    if (q === undefined || fn === undefined) continue;
    const timeout = num(fn.properties["Timeout"], 3);
    if (num(q.properties["VisibilityTimeout"], 30) < timeout * 6)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-VISIBILITY-TOO-LOW",
          severity: "medium",
          title: "Visibility timeout is less than six times the consumer's timeout",
          explanation: `The queue's visibility timeout is ${num(q.properties["VisibilityTimeout"], 30)}s and the function timeout is ${timeout}s. Messages can become visible again while still being processed and run twice.`,
          subject: at(q.logicalId),
          resources: [at(q.logicalId), at(fn.logicalId)],
          recommendation: `Raise the visibility timeout to at least ${timeout * 6}s.`,
        }),
      );
    const types = m.properties["FunctionResponseTypes"];
    if (
      !(Array.isArray(types) && types.includes("ReportBatchItemFailures")) &&
      num(m.properties["BatchSize"], 10) > 1
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-NO-PARTIAL-BATCH",
          severity: "low",
          title: "Batch consumer does not report partial failures",
          explanation:
            "Without ReportBatchItemFailures, one bad message makes the whole batch return to the queue, so good messages are processed again.",
          subject: at(m.logicalId),
          resources: [at(m.logicalId)],
          recommendation:
            "Add FunctionResponseTypes: [ReportBatchItemFailures] and return the failed item ids.",
        }),
      );
  }
  for (const x of resourcesOfType(t, "AWS::SNS::Topic"))
    if (x.properties["KmsMasterKeyId"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-TOPIC-NOT-ENCRYPTED",
          severity: "low",
          title: "Topic has no KMS key",
          explanation: "Messages are not encrypted at rest with a key you control.",
          subject: at(x.logicalId),
          resources: [at(x.logicalId)],
        }),
      );
  for (const s of resourcesOfType(t, "AWS::SNS::Subscription")) {
    if (s.properties["RedrivePolicy"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-SUB-NO-DLQ",
          severity: "low",
          title: "Subscription has no dead-letter queue",
          explanation:
            "If SNS cannot deliver to this endpoint after its retries, the message is dropped for it.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)],
        }),
      );
  }
  for (const p of resourcesOfType(t, "AWS::SQS::QueuePolicy")) {
    const doc = JSON.stringify(p.properties["PolicyDocument"] ?? {});
    if (/"Principal":"\*"|"Principal":\{"AWS":"\*"\}/.test(doc) && !doc.includes('"Condition"'))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "MSG-QUEUE-POLICY-OPEN",
          severity: "high",
          title: "Queue policy allows any principal without a condition",
          explanation: "Anyone could send to or read from the queue.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
          recommendation: "Name the principals, or add a condition such as aws:SourceArn.",
        }),
      );
  }
  return out;
}

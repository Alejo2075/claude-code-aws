import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-events";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const b of resourcesOfType(t, "AWS::Events::EventBus"))
    rows.push({
      kind: "bus",
      id: `${stack}/${b.logicalId}`,
      detail:
        typeof b.properties["Name"] === "string" ? b.properties["Name"] : "(name from template)",
    });
  for (const r of resourcesOfType(t, "AWS::Events::Rule")) {
    const targets = Array.isArray(r.properties["Targets"]) ? r.properties["Targets"].length : 0;
    const what =
      r.properties["ScheduleExpression"] !== undefined
        ? `schedule ${JSON.stringify(r.properties["ScheduleExpression"])}`
        : "event pattern";
    rows.push({
      kind: "rule",
      id: `${stack}/${r.logicalId}`,
      detail: `${what}, ${targets} target(s), state ${typeof r.properties["State"] === "string" ? r.properties["State"] : "ENABLED"}`,
    });
  }
  for (const s of resourcesOfType(t, "AWS::Scheduler::Schedule")) {
    const tz =
      typeof s.properties["ScheduleExpressionTimezone"] === "string"
        ? s.properties["ScheduleExpressionTimezone"]
        : "UTC";
    rows.push({
      kind: "schedule",
      id: `${stack}/${s.logicalId}`,
      detail: `${JSON.stringify(s.properties["ScheduleExpression"])} in ${tz}`,
    });
  }
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const r of resourcesOfType(t, "AWS::Events::Rule")) {
    const targets = Array.isArray(r.properties["Targets"])
      ? r.properties["Targets"].filter(isRecord)
      : [];
    if (
      r.properties["EventPattern"] === undefined &&
      r.properties["ScheduleExpression"] === undefined
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-RULE-NO-TRIGGER",
          severity: "medium",
          title: "Rule has neither an event pattern nor a schedule",
          explanation: "A rule without either never fires.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)],
          recommendation: "Add an EventPattern or a ScheduleExpression.",
        }),
      );
    if (r.properties["State"] === "DISABLED")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-RULE-DISABLED",
          severity: "info",
          title: "Rule is disabled",
          explanation: "The rule is defined but does not deliver events.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)],
        }),
      );
    const pattern = r.properties["EventPattern"];
    if (isRecord(pattern) && Object.keys(pattern).length === 1 && pattern["source"] !== undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-PATTERN-BROAD",
          severity: "low",
          status: "hypothesis",
          title: "Pattern matches every event from a source",
          explanation:
            "A pattern with only `source` forwards all events from that source, which may cost more and trigger targets on events you did not intend.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)],
          recommendation: "Add `detail-type` or `detail` filters.",
        }),
      );
    targets.forEach((target, i) => {
      if (!isRecord(target["DeadLetterConfig"]))
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EVT-TARGET-NO-DLQ",
            severity: "medium",
            title: "Rule target has no dead-letter queue",
            explanation: "If delivery to the target fails after the retries, the event is dropped.",
            subject: `${at(r.logicalId)}#${i}`,
            resources: [at(r.logicalId)],
            recommendation: "Set DeadLetterConfig to an SQS queue, and alarm on its depth.",
          }),
        );
      const retry = target["RetryPolicy"];
      if (isRecord(retry) && retry["MaximumRetryAttempts"] === 0)
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EVT-TARGET-NO-RETRY",
            severity: "low",
            title: "Target retries are turned off",
            explanation:
              "With zero retry attempts, a transient failure loses the event unless a dead-letter queue catches it.",
            subject: `${at(r.logicalId)}#${i}`,
            resources: [at(r.logicalId)],
          }),
        );
    });
  }
  for (const s of resourcesOfType(t, "AWS::Scheduler::Schedule")) {
    if (
      s.properties["ScheduleExpressionTimezone"] === undefined &&
      typeof s.properties["ScheduleExpression"] === "string" &&
      s.properties["ScheduleExpression"].startsWith("cron(")
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-SCHEDULE-UTC-DEFAULT",
          severity: "low",
          title: "Cron schedule has no time zone",
          explanation:
            "Without ScheduleExpressionTimezone the cron runs in UTC. If the business meaning is local time, it will drift by an hour across daylight saving changes.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)],
          recommendation: "Set ScheduleExpressionTimezone to the intended IANA zone.",
        }),
      );
    const target = s.properties["Target"];
    if (isRecord(target) && !isRecord(target["DeadLetterConfig"]))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-SCHEDULE-NO-DLQ",
          severity: "low",
          title: "Schedule target has no dead-letter queue",
          explanation: "A failed invocation is retried and then dropped without a record.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)],
        }),
      );
  }
  for (const p of resourcesOfType(t, "AWS::Events::EventBusPolicy")) {
    const principal = p.properties["Principal"];
    const statement = p.properties["Statement"];
    if (
      principal === "*" ||
      (isRecord(statement) &&
        (statement["Principal"] === "*" ||
          (isRecord(statement["Principal"]) &&
            statement["Principal"]["AWS"] === "*" &&
            statement["Condition"] === undefined)))
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-BUS-POLICY-OPEN",
          severity: "high",
          title: "Event bus policy allows any principal",
          explanation: "Any AWS account may be able to put events on this bus.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
          recommendation: "Name the accounts, or add a condition such as aws:PrincipalOrgID.",
        }),
      );
  }
  return out;
}

export const ENVELOPE = {
  source: "company.domain.service",
  "detail-type": "OrderPlaced.v1",
  detail: {
    metadata: {
      eventId: "uuid",
      occurredAt: "2026-01-01T00:00:00Z",
      schemaVersion: "1",
      correlationId: "uuid",
      producer: "orders-service",
    },
    data: { orderId: "o-123" },
  },
};

export const ENVELOPE_GUIDANCE = [
  "Put the version in `detail-type` (OrderPlaced.v1) so a rule can match one version, and add a field only in a backwards compatible way.",
  "Keep identity and tracing in `detail.metadata` and business data in `detail.data`, so consumers can route on metadata without parsing data.",
  "Include a unique eventId: consumers are at-least-once and need it to ignore duplicates.",
  "Do not put secrets or personal data in events: they are copied to every target and to archives.",
  "The whole event is limited in size; send an identifier and let the consumer fetch large content.",
];

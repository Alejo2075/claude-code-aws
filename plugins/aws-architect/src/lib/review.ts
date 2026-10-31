// A review of a synthesized template against questions taken from the Well-Architected Serverless
// Applications Lens. A question is answered only when the template can answer it; the rest are
// listed as needing evidence from code, the account, or the team. Nothing here is a score.
import { iamStatements, type Template, resourcesOfType } from "@claude-code-aws/template-analysis";

export type Answer = "yes" | "partly" | "no" | "not-in-template";

export interface Question {
  id: string;
  pillar:
    | "operational-excellence"
    | "security"
    | "reliability"
    | "performance"
    | "cost"
    | "sustainability";
  question: string;
  source: string;
  evaluate: (template: Template) => { answer: Answer; evidence: string };
}

const LENS =
  "https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/welcome.html";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const ratio = (ok: number, total: number): Answer =>
  total === 0 ? "not-in-template" : ok === total ? "yes" : ok === 0 ? "no" : "partly";
const count = (ok: number, total: number, what: string): string =>
  total === 0 ? "nothing of this kind in the template" : `${ok} of ${total} ${what}`;

export const QUESTIONS: readonly Question[] = [
  {
    id: "REL-DLQ",
    pillar: "reliability",
    question:
      "Do asynchronous sources have a dead-letter queue, so failing messages are kept for inspection?",
    source:
      "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html",
    evaluate: (t) => {
      const queues = resourcesOfType(t, "AWS::SQS::Queue");
      const targets = new Set(
        queues.flatMap((q) =>
          isRecord(q.properties["RedrivePolicy"])
            ? (JSON.stringify(q.properties["RedrivePolicy"]).match(
                /"Fn::GetAtt":\["([^"]+)"/,
              )?.[1] ?? [])
            : [],
        ),
      );
      const sources = queues.filter((q) => !targets.has(q.logicalId));
      const ok = sources.filter((q) => q.properties["RedrivePolicy"] !== undefined).length;
      return {
        answer: ratio(ok, sources.length),
        evidence: count(ok, sources.length, "source queues have a redrive policy"),
      };
    },
  },
  {
    id: "REL-VISIBILITY",
    pillar: "reliability",
    question:
      "Is each queue's visibility timeout at least six times its consumer function's timeout?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html",
    evaluate: (t) => {
      let ok = 0;
      let total = 0;
      for (const mapping of resourcesOfType(t, "AWS::Lambda::EventSourceMapping")) {
        const queue =
          t.resources[
            JSON.stringify(mapping.properties["EventSourceArn"]).match(
              /"Fn::GetAtt":\["([^"]+)"/,
            )?.[1] ?? ""
          ];
        const fn =
          t.resources[
            JSON.stringify(mapping.properties["FunctionName"]).match(/"Ref":"([^"]+)"/)?.[1] ?? ""
          ];
        if (queue?.type !== "AWS::SQS::Queue" || fn === undefined) continue;
        total += 1;
        const visibility =
          typeof queue.properties["VisibilityTimeout"] === "number"
            ? queue.properties["VisibilityTimeout"]
            : 30;
        const timeout = typeof fn.properties["Timeout"] === "number" ? fn.properties["Timeout"] : 3;
        if (visibility >= timeout * 6) ok += 1;
      }
      return {
        answer: ratio(ok, total),
        evidence: count(ok, total, "queue-to-function links meet the six-times guideline"),
      };
    },
  },
  {
    id: "REL-IDEMPOTENCY",
    pillar: "reliability",
    question: "Are handlers idempotent, so duplicate deliveries do no harm?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html",
    evaluate: () => ({
      answer: "not-in-template",
      evidence:
        "Idempotency is a property of the handler code and its data model; a template cannot show it.",
    }),
  },
  {
    id: "OPS-TRACING",
    pillar: "operational-excellence",
    question: "Is distributed tracing enabled on the functions?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html",
    evaluate: (t) => {
      const fns = resourcesOfType(t, "AWS::Lambda::Function");
      const ok = fns.filter(
        (f) =>
          isRecord(f.properties["TracingConfig"]) &&
          f.properties["TracingConfig"]["Mode"] === "Active",
      ).length;
      return {
        answer: ratio(ok, fns.length),
        evidence: count(ok, fns.length, "functions have active tracing"),
      };
    },
  },
  {
    id: "OPS-ALARMS",
    pillar: "operational-excellence",
    question:
      "Are there alarms on the signals that show failure (errors, throttles, queue age, dead-letter depth)?",
    source:
      "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html",
    evaluate: (t) => {
      const alarms = resourcesOfType(t, "AWS::CloudWatch::Alarm").length;
      const watched = resourcesOfType(t, "AWS::Lambda::Function", "AWS::SQS::Queue").length;
      return {
        answer: watched === 0 ? "not-in-template" : alarms === 0 ? "no" : "partly",
        evidence: `${alarms} alarm(s) for ${watched} function(s) and queue(s). Whether they cover the right signals needs a reading of their definitions.`,
      };
    },
  },
  {
    id: "OPS-LOG-RETENTION",
    pillar: "operational-excellence",
    question: "Do logs have a defined retention period?",
    source:
      "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html",
    evaluate: (t) => {
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
    },
  },
  {
    id: "SEC-AUTHZ",
    pillar: "security",
    question: "Do API routes have an authorizer?",
    source:
      "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-to-api.html",
    evaluate: (t) => {
      const routes = resourcesOfType(t, "AWS::ApiGatewayV2::Route");
      const methods = resourcesOfType(t, "AWS::ApiGateway::Method").filter(
        (m) => m.properties["HttpMethod"] !== "OPTIONS",
      );
      const ok =
        routes.filter((r) => (r.properties["AuthorizationType"] ?? "NONE") !== "NONE").length +
        methods.filter((m) => (m.properties["AuthorizationType"] ?? "NONE") !== "NONE").length;
      return {
        answer: ratio(ok, routes.length + methods.length),
        evidence: `${count(ok, routes.length + methods.length, "routes have an authorizer")}. Whether the handler checks that this caller may touch this data (tenant isolation) is not visible in a template.`,
      };
    },
  },
  {
    id: "SEC-LEAST-PRIVILEGE",
    pillar: "security",
    question: "Are permissions scoped to specific actions and resources?",
    source: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html",
    evaluate: (t) => {
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
    },
  },
  {
    id: "SEC-PUBLIC-EXPOSURE",
    pillar: "security",
    question: "Are storage resources protected from public access?",
    source:
      "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html",
    evaluate: (t) => {
      const buckets = resourcesOfType(t, "AWS::S3::Bucket");
      const ok = buckets.filter(
        (b) =>
          isRecord(b.properties["PublicAccessBlockConfiguration"]) &&
          Object.values(b.properties["PublicAccessBlockConfiguration"]).every((v) => v === true),
      ).length;
      return {
        answer: ratio(ok, buckets.length),
        evidence: count(ok, buckets.length, "buckets block public access"),
      };
    },
  },
  {
    id: "PERF-MEMORY",
    pillar: "performance",
    question: "Were function memory and timeout sized from measurements?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html",
    evaluate: (t) => ({
      answer: "not-in-template",
      evidence: `${resourcesOfType(t, "AWS::Lambda::Function").length} function(s) set memory and timeout in the template, but whether the values came from measurements is a question for the team (see /aws-cost:compare lambda-memory).`,
    }),
  },
  {
    id: "COST-ON-DEMAND",
    pillar: "cost",
    question: "Are data stores billed in the mode that fits their traffic?",
    source: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html",
    evaluate: (t) => {
      const tables = resourcesOfType(t, "AWS::DynamoDB::Table");
      const onDemand = tables.filter(
        (x) => x.properties["BillingMode"] === "PAY_PER_REQUEST",
      ).length;
      return {
        answer: "not-in-template",
        evidence: `${count(onDemand, tables.length, "tables are on-demand")}. Whether on-demand or provisioned is cheaper depends on traffic, which a template does not show.`,
      };
    },
  },
];

export interface Review {
  answered: Array<{
    id: string;
    pillar: Question["pillar"];
    question: string;
    answer: Answer;
    evidence: string;
    source: string;
  }>;
  needsOthers: string[];
}

export function review(template: Template): Review {
  const answered = QUESTIONS.map((q) => ({
    id: q.id,
    pillar: q.pillar,
    question: q.question,
    source: q.source,
    ...q.evaluate(template),
  }));
  return {
    answered,
    needsOthers: [
      "Sustainability, most of Performance, and the organizational parts of Operational Excellence cannot be answered from a template.",
      "The Serverless Lens has many more questions than these; this is a subset that a template can speak to. Run the full review with your team.",
    ],
  };
}

export { LENS };

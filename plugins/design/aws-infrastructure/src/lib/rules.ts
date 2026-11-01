// The `iac-quality` rule pack: operational quality of the CDK app as it shows in the synthesized
// template. Security rules live in aws-security. Each rule has an id, a rationale, a source, and a
// positive and a negative fixture in the tests.
import {
  type ResourceInfo,
  type Rule,
  type RuleHit,
  resourcesOfType,
  runtimeStatus,
  STATEFUL_TYPES,
  type Template,
} from "@claude-code-aws/template-analysis";

const SQS_DLQ =
  "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html";
const LAMBDA_SQS = "https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html";
const LAMBDA_BEST = "https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html";
const LAMBDA_RUNTIMES = "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html";
const DDB_PITR =
  "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html";
const CFN_DELETION =
  "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html";
const CW_LOGS_RETENTION =
  "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html";
const XRAY_LAMBDA = "https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html";
const CW_ALARMS =
  "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The logical id a `Ref`/`Fn::GetAtt` points at, if the value is one. */
function target(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value["Ref"] === "string") return value["Ref"];
  const getAtt = value["Fn::GetAtt"];
  if (Array.isArray(getAtt) && typeof getAtt[0] === "string") return getAtt[0];
  if (typeof getAtt === "string") return getAtt.split(".")[0] ?? null;
  return null;
}

/**
 * The functions that are the user's own code. A function that serves as a custom resource's
 * `ServiceToken` is a helper that CDK or a library adds (for example the S3 notifications handler),
 * and findings about it would not be actionable.
 */
function userFunctions(template: Template): ResourceInfo[] {
  const providers = new Set(
    Object.values(template.resources)
      .filter(
        (resource) =>
          resource.type.startsWith("Custom::") ||
          resource.type === "AWS::CloudFormation::CustomResource",
      )
      .map((resource) => target(resource.properties["ServiceToken"])),
  );
  return resourcesOfType(template, "AWS::Lambda::Function").filter(
    (fn) => !providers.has(fn.logicalId),
  );
}

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" ? value : fallback;

const noDeadLetterQueue: Rule = {
  id: "INFRA-SQS-NO-DLQ",
  pack: "iac-quality",
  severity: "medium",
  title: "Queue without a dead-letter queue",
  rationale:
    "A message that keeps failing is retried until it expires, with nowhere to inspect it.",
  source: SQS_DLQ,
  recommendation:
    "Add a dead-letter queue with a redrive policy (for example maxReceiveCount 3 to 5) and an alarm on its depth.",
  check: (template) => {
    const queues = resourcesOfType(template, "AWS::SQS::Queue");
    const deadLetterTargets = new Set(
      queues
        .map((queue) =>
          target(
            (queue.properties["RedrivePolicy"] as Record<string, unknown> | undefined)?.[
              "deadLetterTargetArn"
            ],
          ),
        )
        .filter((id) => id !== null),
    );
    return queues
      .filter(
        (queue) =>
          queue.properties["RedrivePolicy"] === undefined &&
          !deadLetterTargets.has(queue.logicalId),
      )
      .map((queue): RuleHit => ({
        logicalId: queue.logicalId,
        explanation: `${queue.logicalId} has no redrive policy and is not a dead-letter queue itself.`,
      }));
  },
};

const visibilityTimeout: Rule = {
  id: "INFRA-SQS-VISIBILITY-TIMEOUT",
  pack: "iac-quality",
  severity: "high",
  title: "Queue visibility timeout is shorter than six times the consumer's timeout",
  rationale:
    "Lambda recommends a visibility timeout of at least six times the function timeout; a shorter one lets messages reappear while they are still being processed, which causes duplicate processing.",
  source: LAMBDA_SQS,
  recommendation:
    "Raise the queue's visibility timeout to at least six times the function timeout, or lower the function timeout.",
  check: (template) => {
    const hits: RuleHit[] = [];
    for (const mapping of resourcesOfType(template, "AWS::Lambda::EventSourceMapping")) {
      const queueId = target(mapping.properties["EventSourceArn"]);
      const functionId = target(mapping.properties["FunctionName"]);
      const queue = queueId === null ? undefined : template.resources[queueId];
      const fn = functionId === null ? undefined : template.resources[functionId];
      if (queue?.type !== "AWS::SQS::Queue" || fn?.type !== "AWS::Lambda::Function") continue;
      const visibility = num(queue.properties["VisibilityTimeout"], 30);
      const timeout = num(fn.properties["Timeout"], 3);
      if (visibility < timeout * 6) {
        hits.push({
          logicalId: queue.logicalId,
          explanation: `${queue.logicalId} has a visibility timeout of ${visibility}s but ${fn.logicalId} can run for ${timeout}s, which needs at least ${timeout * 6}s.`,
          affected: [queue.logicalId, fn.logicalId],
        });
      }
    }
    return hits;
  },
};

const defaultTimeout: Rule = {
  id: "INFRA-LAMBDA-DEFAULT-TIMEOUT",
  pack: "iac-quality",
  severity: "low",
  title: "Lambda function relies on the default timeout",
  rationale:
    "The default is 3 seconds. A function that depends on it was probably never sized on purpose.",
  source: LAMBDA_BEST,
  recommendation:
    "Set an explicit timeout based on measured duration, with headroom, and below any caller's timeout.",
  check: (template) =>
    userFunctions(template)
      .filter((fn) => fn.properties["Timeout"] === undefined)
      .map((fn) => ({
        logicalId: fn.logicalId,
        explanation: `${fn.logicalId} sets no Timeout, so it uses the 3 second default.`,
      })),
};

const deprecatedRuntime: Rule = {
  id: "INFRA-LAMBDA-RUNTIME-SUPPORT",
  pack: "iac-quality",
  severity: "high",
  title: "Lambda runtime is deprecated or about to be",
  rationale:
    "A deprecated runtime no longer receives security patches, and Lambda eventually blocks updates to functions that use it.",
  source: LAMBDA_RUNTIMES,
  recommendation:
    "Move to a supported runtime and test the function with it before deploying. The check uses a dated snapshot of the runtime table.",
  check: (template, { now }) => {
    const hits: RuleHit[] = [];
    for (const fn of resourcesOfType(template, "AWS::Lambda::Function")) {
      const runtime = fn.properties["Runtime"];
      if (typeof runtime !== "string") continue;
      const status = runtimeStatus(runtime, now);
      if (status.state === "deprecated") {
        hits.push({
          logicalId: fn.logicalId,
          explanation: `${fn.logicalId} uses ${runtime}, deprecated since ${status.deprecationDate ?? "an earlier date"}.`,
        });
      } else if (status.state === "approaching") {
        hits.push({
          logicalId: fn.logicalId,
          explanation: `${fn.logicalId} uses ${runtime}, which is deprecated on ${status.deprecationDate ?? "a date within 180 days"}.`,
        });
      } else if (status.state === "preview") {
        hits.push({
          logicalId: fn.logicalId,
          explanation: `${fn.logicalId} uses ${runtime}, a preview runtime that is not covered by the Lambda SLA.`,
        });
      }
    }
    return hits;
  },
};

const logRetention: Rule = {
  id: "INFRA-LOG-RETENTION",
  pack: "iac-quality",
  severity: "low",
  title: "Lambda logs are kept forever",
  rationale: "A log group with no retention never expires and keeps costing storage.",
  source: CW_LOGS_RETENTION,
  recommendation:
    "Give each function a log group with a retention period that matches how long you investigate incidents.",
  check: (template) => {
    const hits: RuleHit[] = [];
    const retentionGroups = new Set(
      resourcesOfType(template, "AWS::Logs::LogGroup")
        .filter((group) => group.properties["RetentionInDays"] !== undefined)
        .map((group) => group.logicalId),
    );
    const retainedByCustom = resourcesOfType(template, "Custom::LogRetention").map((resource) =>
      target(resource.properties["LogGroupName"]),
    );
    for (const fn of userFunctions(template)) {
      const configured = target(
        (fn.properties["LoggingConfig"] as Record<string, unknown> | undefined)?.["LogGroup"],
      );
      if (
        (configured !== null && retentionGroups.has(configured)) ||
        retainedByCustom.includes(fn.logicalId)
      )
        continue;
      hits.push({
        logicalId: fn.logicalId,
        explanation: `${fn.logicalId} has no log group with a retention period in this template.`,
      });
    }
    return hits;
  },
};

const RETAIN_CHECKED = [...Object.keys(STATEFUL_TYPES)].filter(
  (type) => !["AWS::Logs::LogGroup", "AWS::SQS::Queue", "AWS::Events::EventBus"].includes(type),
);

const destroyWithStack: Rule = {
  id: "INFRA-STATEFUL-DESTROY",
  pack: "iac-quality",
  severity: "medium",
  title: "Stateful resource is deleted with the stack",
  rationale:
    "With a Delete policy, removing the stack or the resource from the code deletes its data.",
  source: CFN_DELETION,
  recommendation:
    "Use Retain (or Snapshot where supported) for anything that holds data you cannot recreate; keep Delete for disposable environments on purpose.",
  check: (template) =>
    Object.values(template.resources)
      .filter(
        (resource) =>
          RETAIN_CHECKED.includes(resource.type) &&
          (resource.deletionPolicy === "Delete" ||
            (resource.deletionPolicy === null && resource.type !== "AWS::KMS::Key")),
      )
      .map((resource) => ({
        logicalId: resource.logicalId,
        explanation: `${resource.logicalId} (${resource.type}) has ${resource.deletionPolicy === null ? "no DeletionPolicy, so it is deleted" : "DeletionPolicy Delete"} with the stack.`,
      })),
};

const noPitr: Rule = {
  id: "INFRA-DDB-NO-PITR",
  pack: "iac-quality",
  severity: "medium",
  title: "DynamoDB table without point-in-time recovery",
  rationale: "Without it, an accidental write or delete cannot be undone to a point in time.",
  source: DDB_PITR,
  recommendation:
    "Enable PointInTimeRecoverySpecification, and weigh its storage cost for disposable tables.",
  check: (template) =>
    resourcesOfType(template, "AWS::DynamoDB::Table")
      .filter(
        (table) =>
          (
            table.properties["PointInTimeRecoverySpecification"] as
              Record<string, unknown> | undefined
          )?.["PointInTimeRecoveryEnabled"] !== true,
      )
      .map((table) => ({
        logicalId: table.logicalId,
        explanation: `${table.logicalId} does not enable point-in-time recovery.`,
      })),
};

const noTracing: Rule = {
  id: "INFRA-LAMBDA-NO-TRACING",
  pack: "iac-quality",
  severity: "info",
  title: "Lambda function without active tracing",
  rationale: "Without X-Ray tracing, following one request across services depends on logs alone.",
  source: XRAY_LAMBDA,
  recommendation:
    "Enable active tracing where the added cost and latency are acceptable, and propagate a correlation id either way.",
  check: (template) =>
    userFunctions(template)
      .filter(
        (fn) =>
          (fn.properties["TracingConfig"] as Record<string, unknown> | undefined)?.["Mode"] !==
          "Active",
      )
      .map((fn) => ({
        logicalId: fn.logicalId,
        explanation: `${fn.logicalId} has no active X-Ray tracing.`,
      })),
};

const noAlarms: Rule = {
  id: "INFRA-NO-ALARMS",
  pack: "iac-quality",
  severity: "info",
  title: "No CloudWatch alarms in this stack",
  rationale: "A stack with functions or queues and no alarms relies on someone noticing failures.",
  source: CW_ALARMS,
  recommendation:
    "Alarm at least on function errors and throttles, dead-letter queue depth, and the age of the oldest queue message.",
  check: (template) => {
    const watched = resourcesOfType(
      template,
      "AWS::Lambda::Function",
      "AWS::SQS::Queue",
      "AWS::StepFunctions::StateMachine",
    );
    return watched.length > 0 && resourcesOfType(template, "AWS::CloudWatch::Alarm").length === 0
      ? [
          {
            explanation: `The stack has ${watched.length} function, queue, or state machine resource(s) and no alarm.`,
            at: "Resources",
            affected: [],
          },
        ]
      : [];
  },
};

export const IAC_QUALITY_RULES: readonly Rule[] = [
  noDeadLetterQueue,
  visibilityTimeout,
  defaultTimeout,
  deprecatedRuntime,
  logRetention,
  destroyWithStack,
  noPitr,
  noTracing,
  noAlarms,
];

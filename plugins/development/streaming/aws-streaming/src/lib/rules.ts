import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-streaming";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "?";
const ref = (v: unknown): string =>
  JSON.stringify(v).match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ??
  JSON.stringify(v).match(/"Ref":"([^"]+)"/)?.[1] ??
  "";

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const s of resourcesOfType(t, "AWS::Kinesis::Stream")) {
    const mode = isRecord(s.properties["StreamModeDetails"])
      ? text(s.properties["StreamModeDetails"]["StreamMode"])
      : "PROVISIONED";
    rows.push({
      kind: "stream",
      id: `${stack}/${s.logicalId}`,
      detail: `${mode}${mode === "PROVISIONED" ? `, ${text(s.properties["ShardCount"])} shard(s)` : ""}, retention ${text(s.properties["RetentionPeriodHours"] ?? 24)}h`,
    });
  }
  for (const f of resourcesOfType(t, "AWS::KinesisFirehose::DeliveryStream")) {
    const dest = [
      "ExtendedS3DestinationConfiguration",
      "S3DestinationConfiguration",
      "HttpEndpointDestinationConfiguration",
      "RedshiftDestinationConfiguration",
      "AmazonopensearchserviceDestinationConfiguration",
    ].find((k) => f.properties[k] !== undefined);
    rows.push({
      kind: "delivery-stream",
      id: `${stack}/${f.logicalId}`,
      detail: dest ?? "destination not recognized",
    });
  }
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  const streams = resourcesOfType(t, "AWS::Kinesis::Stream");
  for (const s of streams)
    if (s.properties["StreamEncryption"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STR-NO-ENCRYPTION",
          severity: "low",
          title: "Stream has no server-side encryption",
          explanation: "Records are stored unencrypted at rest.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)],
          recommendation: "Set StreamEncryption with a KMS key.",
        }),
      );
  for (const m of resourcesOfType(t, "AWS::Lambda::EventSourceMapping")) {
    const source = t.resources[ref(m.properties["EventSourceArn"])];
    if (
      source === undefined ||
      !["AWS::Kinesis::Stream", "AWS::DynamoDB::Table"].includes(source.type)
    )
      continue;
    const id = at(m.logicalId);
    const retries = m.properties["MaximumRetryAttempts"];
    if (m.properties["BisectBatchOnFunctionError"] !== true)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STR-ESM-NO-BISECT",
          severity: "medium",
          title: "Stream consumer does not split failing batches",
          explanation:
            "Without BisectBatchOnFunctionError, one bad record makes the whole batch fail again and again.",
          subject: id,
          resources: [id],
          recommendation: "Set BisectBatchOnFunctionError to true.",
        }),
      );
    if (retries === undefined || retries === -1)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STR-ESM-INFINITE-RETRY",
          severity: "high",
          title: "Stream consumer retries a failing batch until the records expire",
          explanation:
            "A poison record blocks its shard: later records wait behind it until it ages out of the stream, and the iterator age keeps growing.",
          subject: id,
          resources: [id],
          recommendation:
            "Set MaximumRetryAttempts and MaximumRecordAgeInSeconds, and an on-failure destination.",
        }),
      );
    if (!isRecord(m.properties["DestinationConfig"]))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STR-ESM-NO-ONFAILURE",
          severity: "medium",
          title: "Stream consumer has no on-failure destination",
          explanation:
            "Records that exhaust their retries are discarded without a copy of their position.",
          subject: id,
          resources: [id],
          recommendation: "Add DestinationConfig.OnFailure (SQS or SNS).",
        }),
      );
  }
  for (const f of resourcesOfType(t, "AWS::KinesisFirehose::DeliveryStream")) {
    const s3 = f.properties["ExtendedS3DestinationConfiguration"];
    if (isRecord(s3)) {
      if (
        s3["ErrorOutputPrefix"] === undefined &&
        (s3["ProcessingConfiguration"] !== undefined ||
          s3["DynamicPartitioningConfiguration"] !== undefined)
      )
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "STR-FH-NO-ERROR-PREFIX",
            severity: "medium",
            title: "Delivery stream with processing has no error output prefix",
            explanation:
              "Records that fail processing or partitioning have nowhere clearly separate to land.",
            subject: at(f.logicalId),
            resources: [at(f.logicalId)],
            recommendation: "Set ErrorOutputPrefix.",
          }),
        );
      const hints = s3["BufferingHints"];
      if (isRecord(hints)) {
        const size = hints["SizeInMBs"];
        const interval = hints["IntervalInSeconds"];
        if (
          (typeof size === "number" && (size < 1 || size > 128)) ||
          (typeof interval === "number" && (interval < 0 || interval > 900))
        )
          out.push(
            staticFinding(PLUGIN, {
              ruleId: "STR-FH-BUFFER-RANGE",
              severity: "high",
              title: "Buffering hints are outside the allowed range",
              explanation:
                "SizeInMBs must be 1 to 128 and IntervalInSeconds 0 to 900 (BufferingHints API reference).",
              subject: at(f.logicalId),
              resources: [at(f.logicalId)],
            }),
          );
      }
      if (s3["CompressionFormat"] === undefined || s3["CompressionFormat"] === "UNCOMPRESSED")
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "STR-FH-NO-COMPRESSION",
            severity: "info",
            title: "Delivered objects are not compressed",
            explanation:
              "Compression reduces S3 storage and downstream scan cost for most text formats.",
            subject: at(f.logicalId),
            resources: [at(f.logicalId)],
          }),
        );
    }
  }
  return out;
}

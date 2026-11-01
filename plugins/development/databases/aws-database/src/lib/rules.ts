import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { isRetained, resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-database";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const keyAttrs = (schema: unknown): string[] =>
  Array.isArray(schema)
    ? schema
        .filter(isRecord)
        .map((k) => (typeof k["AttributeName"] === "string" ? k["AttributeName"] : ""))
    : [];

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const tb of resourcesOfType(t, "AWS::DynamoDB::Table")) {
    const gsis = Array.isArray(tb.properties["GlobalSecondaryIndexes"])
      ? tb.properties["GlobalSecondaryIndexes"].length
      : 0;
    rows.push({
      kind: "table",
      id: `${stack}/${tb.logicalId}`,
      detail: `keys [${keyAttrs(tb.properties["KeySchema"]).join(", ")}], ${gsis} GSI(s), ${tb.properties["BillingMode"] === "PAY_PER_REQUEST" ? "on-demand" : "provisioned"}`,
    });
  }
  for (const c of resourcesOfType(t, "AWS::RDS::DBCluster"))
    rows.push({
      kind: "aurora",
      id: `${stack}/${c.logicalId}`,
      detail: `${typeof c.properties["Engine"] === "string" ? c.properties["Engine"] : "?"}, ${isRecord(c.properties["ServerlessV2ScalingConfiguration"]) ? "Serverless v2" : "not Serverless v2"}`,
    });
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const tb of resourcesOfType(t, "AWS::DynamoDB::Table")) {
    const id = at(tb.logicalId);
    const spec = tb.properties["PointInTimeRecoverySpecification"];
    if (!(isRecord(spec) && spec["PointInTimeRecoveryEnabled"] === true))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-NO-PITR",
          severity: "medium",
          title: "Point-in-time recovery is off",
          explanation: "A bad write or delete cannot be rolled back to an earlier moment.",
          subject: id,
          resources: [id],
          recommendation: "Enable point-in-time recovery.",
        }),
      );
    if (tb.properties["DeletionProtectionEnabled"] !== true)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-NO-DELETION-PROTECTION",
          severity: "low",
          title: "Deletion protection is off",
          explanation: "A stack deletion or a mistaken command can delete the table and its data.",
          subject: id,
          resources: [id],
        }),
      );
    if (!isRetained(tb))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-NO-RETAIN",
          severity: "medium",
          title: "The table is not retained when the stack deletes or replaces it",
          explanation:
            "Without Retain (or Snapshot), deleting the stack or replacing the table deletes the data.",
          subject: id,
          resources: [id],
        }),
      );
    const defined = Array.isArray(tb.properties["AttributeDefinitions"])
      ? tb.properties["AttributeDefinitions"]
          .filter(isRecord)
          .map((a) => (typeof a["AttributeName"] === "string" ? a["AttributeName"] : ""))
      : [];
    const used = new Set([
      ...keyAttrs(tb.properties["KeySchema"]),
      ...(Array.isArray(tb.properties["GlobalSecondaryIndexes"])
        ? tb.properties["GlobalSecondaryIndexes"]
            .filter(isRecord)
            .flatMap((g) => keyAttrs(g["KeySchema"]))
        : []),
      ...(Array.isArray(tb.properties["LocalSecondaryIndexes"])
        ? tb.properties["LocalSecondaryIndexes"]
            .filter(isRecord)
            .flatMap((g) => keyAttrs(g["KeySchema"]))
        : []),
    ]);
    for (const a of defined)
      if (!used.has(a))
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "DB-UNUSED-ATTRIBUTE-DEFINITION",
            severity: "high",
            title: `Attribute ${a} is defined but is not part of any key`,
            explanation:
              "AttributeDefinitions may list only attributes used in a key schema; CloudFormation rejects the table otherwise.",
            subject: `${id}:${a}`,
            resources: [id],
          }),
        );
    const gsiCount = Array.isArray(tb.properties["GlobalSecondaryIndexes"])
      ? tb.properties["GlobalSecondaryIndexes"].length
      : 0;
    if (gsiCount > 20)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-GSI-LIMIT",
          severity: "high",
          title: `${gsiCount} global secondary indexes`,
          explanation: "The default quota is 20 global secondary indexes per table.",
          subject: id,
          resources: [id],
        }),
      );
    if (
      Array.isArray(tb.properties["LocalSecondaryIndexes"]) &&
      tb.properties["LocalSecondaryIndexes"].length > 5
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-LSI-LIMIT",
          severity: "high",
          title: "More than 5 local secondary indexes",
          explanation:
            "A table may have at most 5 local secondary indexes, and they can only be added when the table is created.",
          subject: id,
          resources: [id],
        }),
      );
    for (const g of Array.isArray(tb.properties["GlobalSecondaryIndexes"])
      ? tb.properties["GlobalSecondaryIndexes"].filter(isRecord)
      : [])
      if (isRecord(g["Projection"]) && g["Projection"]["ProjectionType"] === "ALL")
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "DB-GSI-PROJECT-ALL",
            severity: "info",
            title: `Index ${typeof g["IndexName"] === "string" ? g["IndexName"] : "?"} projects all attributes`,
            explanation:
              "Every write copies the whole item into the index and the index stores it again. Project only what the query needs unless you need all of it.",
            subject: `${id}:${typeof g["IndexName"] === "string" ? g["IndexName"] : "?"}`,
            resources: [id],
          }),
        );
  }
  for (const c of resourcesOfType(t, "AWS::RDS::DBCluster")) {
    const id = at(c.logicalId);
    if (c.properties["StorageEncrypted"] !== true)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-AURORA-NOT-ENCRYPTED",
          severity: "high",
          title: "Aurora cluster storage is not encrypted",
          explanation: "Encryption at rest can only be chosen when the cluster is created.",
          subject: id,
          resources: [id],
        }),
      );
    if (c.properties["DeletionProtection"] !== true)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-AURORA-NO-DELETION-PROTECTION",
          severity: "medium",
          title: "Aurora cluster has no deletion protection",
          explanation: "The cluster can be deleted by a stack deletion or a single command.",
          subject: id,
          resources: [id],
        }),
      );
    if (
      typeof c.properties["MasterUserPassword"] === "string" &&
      !c.properties["MasterUserPassword"].startsWith("{{resolve:")
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-AURORA-LITERAL-PASSWORD",
          severity: "high",
          title: "The master password is a literal in the template",
          explanation: "The password is stored in the template and its history.",
          subject: id,
          resources: [id],
          recommendation: "Use ManageMasterUserPassword (Secrets Manager) or a dynamic reference.",
        }),
      );
    if (
      typeof c.properties["BackupRetentionPeriod"] !== "number" ||
      c.properties["BackupRetentionPeriod"] < 7
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "DB-AURORA-SHORT-BACKUP",
          severity: "low",
          title: "Backup retention is under 7 days or left at the default",
          explanation: "Point-in-time restore reaches back only as far as the retention period.",
          subject: id,
          resources: [id],
        }),
      );
  }
  return out;
}

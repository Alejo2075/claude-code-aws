import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-storage";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const b of resourcesOfType(t, "AWS::S3::Bucket")) {
    const bits = [
      isRecord(b.properties["VersioningConfiguration"]) &&
      b.properties["VersioningConfiguration"]["Status"] === "Enabled"
        ? "versioned"
        : "not versioned",
      b.properties["BucketEncryption"] === undefined ? "default encryption" : "explicit encryption",
      b.properties["LifecycleConfiguration"] === undefined ? "no lifecycle" : "lifecycle rules",
    ];
    rows.push({ kind: "bucket", id: `${stack}/${b.logicalId}`, detail: bits.join(", ") });
  }
  for (const f of resourcesOfType(t, "AWS::EFS::FileSystem"))
    rows.push({
      kind: "file-system",
      id: `${stack}/${f.logicalId}`,
      detail: `${f.properties["Encrypted"] === true ? "encrypted" : "NOT encrypted"}, mode ${typeof f.properties["PerformanceMode"] === "string" ? f.properties["PerformanceMode"] : "default"}`,
    });
  for (const a of resourcesOfType(t, "AWS::EFS::AccessPoint"))
    rows.push({
      kind: "access-point",
      id: `${stack}/${a.logicalId}`,
      detail: isRecord(a.properties["RootDirectory"]) ? "root directory set" : "no root directory",
    });
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  const policies = resourcesOfType(t, "AWS::S3::BucketPolicy");
  for (const b of resourcesOfType(t, "AWS::S3::Bucket")) {
    const pab = b.properties["PublicAccessBlockConfiguration"];
    if (
      !(isRecord(pab) && Object.values(pab).every((v) => v === true)) ||
      Object.keys(isRecord(pab) ? pab : {}).length < 4
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-NO-PUBLIC-BLOCK",
          severity: "high",
          title: "Bucket does not turn on all four Block Public Access settings",
          explanation:
            "Without all four settings a mistaken policy or ACL can expose objects publicly.",
          subject: at(b.logicalId),
          resources: [at(b.logicalId)],
          recommendation:
            "Set BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls, and RestrictPublicBuckets to true.",
        }),
      );
    const lifecycle = b.properties["LifecycleConfiguration"];
    const rulesList =
      isRecord(lifecycle) && Array.isArray(lifecycle["Rules"])
        ? lifecycle["Rules"].filter(isRecord)
        : [];
    if (!rulesList.some((r) => r["AbortIncompleteMultipartUpload"] !== undefined))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-NO-ABORT-MULTIPART",
          severity: "low",
          title: "No rule cleans up incomplete multipart uploads",
          explanation:
            "Parts of abandoned uploads stay in the bucket and are billed until they are aborted.",
          subject: at(b.logicalId),
          resources: [at(b.logicalId)],
          recommendation:
            "Add a lifecycle rule with AbortIncompleteMultipartUpload (for example after 7 days).",
        }),
      );
    const policyDocs = policies
      .filter((p) => JSON.stringify(p.properties["Bucket"]).includes(b.logicalId))
      .map((p) => JSON.stringify(p.properties["PolicyDocument"] ?? {}));
    if (!policyDocs.some((d) => d.includes("aws:SecureTransport")))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-NO-TLS-ONLY",
          severity: "low",
          title: "No policy refuses plain HTTP requests",
          explanation:
            "Without a Deny on aws:SecureTransport=false, clients can use unencrypted connections.",
          subject: at(b.logicalId),
          resources: [at(b.logicalId)],
          recommendation:
            "Add a bucket policy that denies requests when aws:SecureTransport is false (CDK: enforceSSL).",
        }),
      );
    const cors = b.properties["CorsConfiguration"];
    const corsRules =
      isRecord(cors) && Array.isArray(cors["CorsRules"]) ? cors["CorsRules"].filter(isRecord) : [];
    if (
      corsRules.some(
        (r) =>
          Array.isArray(r["AllowedOrigins"]) &&
          r["AllowedOrigins"].includes("*") &&
          Array.isArray(r["AllowedMethods"]) &&
          r["AllowedMethods"].some((m) => m !== "GET" && m !== "HEAD"),
      )
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-CORS-WILDCARD-WRITE",
          severity: "medium",
          title: "CORS allows any origin to use write methods",
          explanation:
            "Any website can make browsers send PUT, POST, or DELETE requests to the bucket with the visitor's credentials or presigned URLs.",
          subject: at(b.logicalId),
          resources: [at(b.logicalId)],
        }),
      );
  }
  for (const p of policies) {
    const doc = JSON.stringify(p.properties["PolicyDocument"] ?? {});
    if (
      /"Effect":"Allow"/.test(doc) &&
      /"Principal":("\*"|\{"AWS":"\*"\})/.test(doc) &&
      !doc.includes('"Condition"')
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-POLICY-PUBLIC",
          severity: "high",
          title: "Bucket policy allows any principal without a condition",
          explanation: "Anyone on the internet may be able to perform the allowed actions.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
        }),
      );
  }
  for (const f of resourcesOfType(t, "AWS::EFS::FileSystem")) {
    if (f.properties["Encrypted"] !== true)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-EFS-NOT-ENCRYPTED",
          severity: "high",
          title: "File system is not encrypted",
          explanation: "Encryption at rest can only be chosen when the file system is created.",
          subject: at(f.logicalId),
          resources: [at(f.logicalId)],
        }),
      );
    if (f.properties["BackupPolicy"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-EFS-NO-BACKUP",
          severity: "low",
          title: "File system has no explicit backup policy",
          explanation: "Automatic backups are a setting to decide on, not to leave to a default.",
          subject: at(f.logicalId),
          resources: [at(f.logicalId)],
        }),
      );
  }
  for (const a of resourcesOfType(t, "AWS::EFS::AccessPoint"))
    if (!isRecord(a.properties["RootDirectory"]))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "STO-EFS-AP-NO-ROOT",
          severity: "medium",
          title: "Access point does not restrict a root directory",
          explanation: "Clients see the whole file system instead of one directory.",
          subject: at(a.logicalId),
          resources: [at(a.logicalId)],
        }),
      );
  return out;
}

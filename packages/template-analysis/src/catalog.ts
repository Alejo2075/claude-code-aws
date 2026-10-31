import data from "./data/replacement.json" with { type: "json" };

interface ReplacementData {
  source: string;
  retrieved: string;
  types: Record<string, { createOnly: string[]; primaryIdentifier: string[] }>;
  supplement: { note: string; source: string; types: Record<string, string[]> };
}

const replacement = data as ReplacementData;

export const REPLACEMENT_DATA_SOURCE = replacement.source;
export const REPLACEMENT_DATA_DATE = replacement.retrieved;
export const SUPPLEMENT_NOTE = replacement.supplement.note;

/** Resource types that hold data or state a replacement or deletion can lose, and why. */
export const STATEFUL_TYPES: Readonly<Record<string, string>> = {
  "AWS::DynamoDB::Table": "holds table items",
  "AWS::DynamoDB::GlobalTable": "holds table items in several regions",
  "AWS::S3::Bucket": "holds objects",
  "AWS::SQS::Queue": "holds queued messages",
  "AWS::Kinesis::Stream": "holds stream records",
  "AWS::RDS::DBInstance": "holds a database",
  "AWS::RDS::DBCluster": "holds a database",
  "AWS::EFS::FileSystem": "holds files",
  "AWS::OpenSearchService::Domain": "holds indexed data",
  "AWS::Logs::LogGroup": "holds log data",
  "AWS::KMS::Key": "data encrypted with it becomes unreadable if it is deleted",
  "AWS::SecretsManager::Secret": "holds a secret value",
  "AWS::Cognito::UserPool": "holds user accounts",
  "AWS::Cognito::IdentityPool": "holds identities",
  "AWS::ECR::Repository": "holds container images",
  "AWS::Backup::BackupVault": "holds recovery points",
  "AWS::Events::EventBus": "holds an event archive configuration",
  "AWS::Glue::Database": "holds a data catalog",
  "AWS::Neptune::DBCluster": "holds a database",
  "AWS::DocDB::DBCluster": "holds a database",
  "AWS::ElastiCache::ReplicationGroup": "holds cached data",
  "AWS::MemoryDB::Cluster": "holds data",
};

export function isStateful(type: string): boolean {
  return STATEFUL_TYPES[type] !== undefined;
}

export function statefulReason(type: string): string | null {
  return STATEFUL_TYPES[type] ?? null;
}

/** Properties whose change replaces the resource, per the CloudFormation resource schema. */
export function replacementProperties(type: string): readonly string[] | null {
  return replacement.types[type]?.createOnly ?? null;
}

/** Properties whose change CloudFormation documents as constrained, not as a replacement rule. */
export function constrainedProperties(type: string): readonly string[] {
  return replacement.supplement.types[type] ?? [];
}

export function isKnownType(type: string): boolean {
  return replacement.types[type] !== undefined;
}

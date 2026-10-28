export const SNAPSHOT_SCHEMA_VERSION = 1;

export const ENVIRONMENTS = ["production", "non-production", "unknown"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const VERIFICATIONS = ["verified", "unverified", "expired", "error"] as const;
export type Verification = (typeof VERIFICATIONS)[number];

/** Closed set: SDK error text is only ever used to pick a code, never stored. */
export const DIAGNOSTIC_CODES = [
  "NO_CREDENTIALS",
  "SSO_EXPIRED",
  "CREDENTIALS_EXPIRED",
  "CREDENTIALS_INVALID",
  "ACCESS_DENIED",
  "REGION_UNRESOLVED",
  "OFFLINE",
  "TIMEOUT",
  "CONFIG_INVALID",
  "UNKNOWN_ERROR",
] as const;
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

/**
 * What aws-context knows about the AWS identity of one workspace. A display cache: it never
 * authorizes an operation, and it never contains credentials.
 */
export interface AwsContextSnapshotV1 {
  schemaVersion: 1;
  /** Hash of the workspace directory, never the path itself. */
  workspaceId: string;
  /** Configured selection (AWS_PROFILE). Not proof of anything. */
  profile: string | null;
  region: string | null;
  /** Verified through STS, or the last verified account when `verification` is not `verified`. */
  accountId: string | null;
  principalArn: string | null;
  environment: Environment;
  verification: Verification;
  /** Time of the last successful STS call, kept even when the current state is not `verified`. */
  verifiedAt: string | null;
  staleAfter: string | null;
  diagnosticCode: DiagnosticCode | null;
}

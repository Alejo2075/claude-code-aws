import type { AwsContextSnapshotV1 } from "../src/index.js";

/** Sanitized fixtures only: the account ids below are documentation-style placeholders. */
export const VERIFIED_AT = "2026-01-01T12:00:00.000Z";
export const STALE_AFTER = "2026-01-01T12:05:00.000Z";

export function snapshot(overrides: Partial<AwsContextSnapshotV1> = {}): AwsContextSnapshotV1 {
  return {
    schemaVersion: 1,
    workspaceId: "0123456789abcdef",
    profile: "dev",
    region: "us-east-1",
    accountId: "123456789012",
    principalArn: "arn:aws:sts::123456789012:assumed-role/Developer/session",
    environment: "non-production",
    verification: "verified",
    verifiedAt: VERIFIED_AT,
    staleAfter: STALE_AFTER,
    diagnosticCode: null,
    ...overrides,
  };
}

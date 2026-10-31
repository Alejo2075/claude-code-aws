import { type AwsContextSnapshotV1, interpret } from "@claude-code-aws/context-contract";

import { DEFAULT_CONFIG, type GuardConfig } from "../src/lib/config.js";
import type { EvaluateContext } from "../src/lib/evaluate.js";

export const NOW = Date.parse("2026-01-01T12:01:00.000Z");

export function snapshot(overrides: Partial<AwsContextSnapshotV1> = {}): AwsContextSnapshotV1 {
  return {
    schemaVersion: 1,
    workspaceId: "65d80d2c48b3d23b",
    profile: "dev",
    region: "us-east-1",
    accountId: "123456789012",
    principalArn: "arn:aws:sts::123456789012:assumed-role/Developer/carol",
    environment: "non-production",
    verification: "verified",
    verifiedAt: "2026-01-01T12:00:00.000Z",
    staleAfter: "2026-01-01T12:05:00.000Z",
    diagnosticCode: null,
    ...overrides,
  };
}

export function context(
  overrides: {
    snapshot?: AwsContextSnapshotV1 | null;
    processProfile?: string | null;
    mode?: string;
    config?: Partial<GuardConfig>;
    now?: number;
  } = {},
): EvaluateContext {
  const stored = overrides.snapshot === undefined ? snapshot() : overrides.snapshot;
  return {
    identity: interpret(stored, overrides.now ?? NOW),
    processProfile: overrides.processProfile === undefined ? "dev" : overrides.processProfile,
    mode: overrides.mode ?? "default",
    config: { ...DEFAULT_CONFIG, ...overrides.config },
  };
}

export const production = (extra: Partial<AwsContextSnapshotV1> = {}) =>
  context({ snapshot: snapshot({ environment: "production", ...extra }) });

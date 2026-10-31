import { type Interpretation, maskAccount } from "@claude-code-aws/context-contract";

import {
  type AnalysisReport,
  type ExecutionContext,
  type Finding,
  type ReportMode,
  SCHEMA_VERSION,
  type Severity,
} from "./types.js";

/**
 * The execution context from `aws-context`'s own interpretation of its snapshot. `identityVerified`
 * is never claimed by a plugin: it is true only when the snapshot is current.
 */
export function executionContext(interpretation: Interpretation): ExecutionContext {
  const snapshot = interpretation.snapshot;
  return {
    accountId: snapshot?.accountId ?? null,
    region: snapshot?.region ?? null,
    profile: snapshot?.profile ?? null,
    identityVerified: interpretation.isCurrent,
    environment: snapshot?.environment ?? "unknown",
  };
}

/** The context of a run with no AWS involved. */
export const LOCAL_CONTEXT: ExecutionContext = {
  accountId: null,
  region: null,
  profile: null,
  identityVerified: false,
  environment: "unknown",
};

/** FNV-1a (64-bit) as hex. Not a security hash: a stable, short identity for a finding. */
export function fingerprint(...parts: string[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of parts.join("\u0000")) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export interface FindingInput extends Omit<Finding, "id" | "fingerprint" | "evidence"> {
  evidence?: Finding["evidence"];
  /** What the finding is about, to make the fingerprint specific (a logical id, a file path). */
  subject: string;
}

/** Builds a finding with a stable id and fingerprint. Model findings are hypotheses by default. */
export function makeFinding(input: FindingInput): Finding {
  const { subject, evidence, ...rest } = input;
  const print = fingerprint(input.plugin, input.ruleId, subject);
  const status =
    input.source === "model" && input.status === "confirmed" && (evidence ?? []).length === 0
      ? "hypothesis"
      : input.status;
  return {
    ...rest,
    status,
    evidence: evidence ?? [],
    id: `${input.ruleId}:${print.slice(0, 8)}`,
    fingerprint: print,
  };
}

const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      ORDER[a.severity] - ORDER[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.id.localeCompare(b.id),
  );
}

export function buildReport(input: {
  plugin: string;
  context: ExecutionContext;
  mode: ReportMode;
  summary: string;
  findings: Finding[];
  limitations: string[];
  suppressed?: number;
  now?: Date;
}): AnalysisReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    plugin: input.plugin,
    generatedAt: (input.now ?? new Date()).toISOString(),
    context: input.context,
    mode: input.mode,
    summary: input.summary,
    findings: sortFindings(input.findings),
    limitations: input.limitations,
    ...(input.suppressed === undefined || input.suppressed === 0
      ? {}
      : { suppressed: input.suppressed }),
  };
}

export function describeContext(context: ExecutionContext): string {
  if (context.accountId === null) return "no AWS account involved";
  const parts = [
    `account ${maskAccount(context.accountId)}`,
    context.region ?? "region unknown",
    context.environment === "unknown" ? "environment not classified" : context.environment,
  ];
  return `${parts.join(" · ")} · ${context.identityVerified ? "identity verified" : "identity NOT verified (last known)"}`;
}

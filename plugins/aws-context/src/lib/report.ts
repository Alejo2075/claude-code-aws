import {
  type AwsContextSnapshotV1,
  classifyAccount,
  type EffectiveConfig,
  formatBar,
  interpret,
  type Interpretation,
  maskAccount,
} from "@claude-code-aws/context-contract";

import { DIAGNOSTIC_HELP } from "./diagnostics.js";

export interface StatusReport {
  state: Interpretation["state"];
  /** True only when `accountId` is the current, STS-verified account. */
  isCurrent: boolean;
  bar: string;
  snapshot: AwsContextSnapshotV1 | null;
  ageSeconds: number | null;
  environmentBasis: "user" | "project" | "default";
  warnings: string[];
  help: string | null;
}

export function buildReport(
  snapshot: AwsContextSnapshotV1 | null,
  config: EffectiveConfig,
  now: Date,
): StatusReport {
  const interpretation = interpret(snapshot, now);
  const verifiedAt = snapshot?.verifiedAt ? Date.parse(snapshot.verifiedAt) : Number.NaN;
  return {
    state: interpretation.state,
    isCurrent: interpretation.isCurrent,
    bar: formatBar(interpretation, {
      maskAccountId: config.maskAccountId,
      showProfile: config.showProfile,
    }),
    snapshot,
    ageSeconds: Number.isNaN(verifiedAt)
      ? null
      : Math.max(0, Math.round((now.getTime() - verifiedAt) / 1000)),
    environmentBasis: classifyAccount(config, snapshot?.accountId ?? null).basis,
    warnings: config.warnings,
    help: snapshot?.diagnosticCode ? DIAGNOSTIC_HELP[snapshot.diagnosticCode] : null,
  };
}

function age(seconds: number | null): string {
  if (seconds === null) return "never";
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

/** Explicit `status` output: full details are shown here because the user asked for them. */
export function renderStatusText(report: StatusReport): string {
  const lines = [report.bar, ""];
  const snapshot = report.snapshot;
  if (snapshot === null) {
    lines.push(
      "No AWS context has been recorded for this workspace yet.",
      "Run `aws-context refresh` to verify the active identity.",
    );
  } else {
    const label = report.isCurrent ? "verified and current" : report.state;
    lines.push(`State:        ${label}`);
    lines.push(
      `Account:      ${snapshot.accountId ?? "unknown"}${snapshot.accountId !== null && !report.isCurrent ? " (last known, NOT current)" : ""}`,
    );
    lines.push(`Principal:    ${snapshot.principalArn ?? "unknown"}`);
    lines.push(`Region:       ${snapshot.region ?? "unknown"}`);
    lines.push(
      `Profile:      ${snapshot.profile ?? "none selected"}${snapshot.profile !== null ? " (configured selection, not proof of the account)" : ""}`,
    );
    const basis =
      report.environmentBasis === "default"
        ? "no trusted mapping configured"
        : `from ${report.environmentBasis} configuration`;
    lines.push(`Environment:  ${snapshot.environment} (${basis})`);
    lines.push(
      `Verified at:  ${snapshot.verifiedAt ?? "never"} (${age(report.ageSeconds)}, via STS GetCallerIdentity)`,
    );
    if (snapshot.diagnosticCode !== null) lines.push(`Diagnostic:   ${snapshot.diagnosticCode}`);
  }
  if (report.help !== null) lines.push("", report.help);
  if (report.warnings.length > 0)
    lines.push("", "Configuration warnings:", ...report.warnings.map((w) => `  - ${w}`));
  lines.push("", "This cache is a display aid. It is not authorization for any AWS operation.");
  return lines.join("\n");
}

/** Compact context for the model at session start. Masks the account; full details need `status`. */
export function renderSessionContext(report: StatusReport): string {
  const snapshot = report.snapshot;
  const account = snapshot?.accountId != null ? maskAccount(snapshot.accountId) : "unknown";
  return [
    "AWS context (aws-context plugin, read-only):",
    `- ${report.bar}`,
    `- account ${account}${report.isCurrent ? " (verified with STS)" : " is NOT verified as current"}; region ${snapshot?.region ?? "unknown"}; environment ${snapshot?.environment ?? "unknown"}`,
    "- This describes the identity of Claude Code's own process. A command that sets its own profile or credentials (--profile, AWS_PROFILE=...) may act on a different account.",
    "- This is information, not authorization. Do not mutate AWS resources on the strength of this cache; IAM and the user's approval remain the boundary.",
    "- Use /aws-context:status for full details or a refresh.",
  ].join("\n");
}

export function renderConfigText(config: EffectiveConfig): string {
  const lines = [
    `ttlMinutes:    ${config.ttlMinutes}`,
    `maskAccountId: ${config.maskAccountId}`,
    `showProfile:   ${config.showProfile}`,
    `showUser:      ${config.showUser}`,
    `autoRefresh:   ${config.autoRefresh}`,
    "",
    "Accounts (user file):",
  ];
  const list = (layer: EffectiveConfig["user"], note: string): string[] => {
    const entries = Object.entries(layer?.accounts ?? {});
    return entries.length === 0
      ? ["  (none)"]
      : entries.map(([id, env]) => `  ${id}  ${env}${note}`);
  };
  lines.push(...list(config.user, ""));
  lines.push("", "Accounts (project file):");
  lines.push(
    ...list(config.project, "").map((line) =>
      line.endsWith("non-production")
        ? `${line}  (not trusted: only the user file can mark an account non-production)`
        : line,
    ),
  );
  if (config.warnings.length > 0)
    lines.push("", "Warnings:", ...config.warnings.map((w) => `  - ${w}`));
  return lines.join("\n");
}

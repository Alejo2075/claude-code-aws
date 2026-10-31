import { describeContext } from "./build.js";
import type { AnalysisReport, Finding, TemplateChange, TemplateDiff } from "./types.js";

const LABEL = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
} as const;

function renderFinding(finding: Finding): string[] {
  const lines = [
    `[${LABEL[finding.severity]}] [${finding.status}] ${finding.title} (${finding.ruleId})`,
    `  ${finding.explanation}`,
  ];
  if (finding.affectedResources !== undefined && finding.affectedResources.length > 0) {
    lines.push(`  Affected: ${finding.affectedResources.join(", ")}`);
  }
  for (const evidence of finding.evidence) {
    lines.push(
      `  Evidence: ${evidence.type} ${evidence.reference}${evidence.observedAt === undefined ? "" : ` (${evidence.observedAt})`}`,
    );
  }
  if (finding.recommendation !== undefined) lines.push(`  Fix: ${finding.recommendation}`);
  return lines;
}

/** A short human summary first, then the evidence. Works anywhere text works. */
export function renderReport(
  report: AnalysisReport,
  options: { maxFindings?: number } = {},
): string {
  const lines = [
    `${report.plugin} · ${report.generatedAt}`,
    `Context: ${describeContext(report.context)}`,
    "",
  ];
  lines.push(report.summary);
  const shown = report.findings.slice(0, options.maxFindings ?? report.findings.length);
  if (shown.length > 0) {
    lines.push("", `Findings (${report.findings.length}):`);
    for (const finding of shown) lines.push(...renderFinding(finding), "");
    if (shown.length < report.findings.length) {
      lines.push(`... ${report.findings.length - shown.length} more; use --json for all.`, "");
    }
  } else {
    lines.push("", "No findings.");
  }
  if (report.suppressed !== undefined) {
    lines.push(`${report.suppressed} finding(s) hidden by exclusions in your configuration.`);
  }
  if (report.limitations.length > 0) {
    lines.push("Limitations:", ...report.limitations.map((limitation) => `  - ${limitation}`));
  }
  return lines.join("\n");
}

const MARK: Record<TemplateChange["action"], string> = {
  create: "[+]",
  update: "[~]",
  replace: "[!]",
  "possible-replace": "[?]",
  delete: "[-]",
  unknown: "[?]",
};

export function renderDiff(diff: TemplateDiff): string {
  const { summary } = diff;
  const lines = [
    `${diff.plugin} · ${diff.generatedAt} · ${diff.method === "template" ? "template comparison only" : "change-set backed"}`,
    `Context: ${describeContext(diff.context)}`,
    `Baseline: ${diff.baseline}`,
    `Candidate: ${diff.candidate}`,
    "",
    `${summary.create} to create, ${summary.update} to update, ${summary.replace} to replace, ${summary.possibleReplace} possibly replaced, ${summary.delete} to delete, ${summary.unknown} unknown.`,
    "",
  ];
  if (diff.changes.length === 0) lines.push("No differences.");
  for (const change of diff.changes) {
    const flags = [
      change.stateful ? "stateful" : null,
      change.retained === true ? "retained" : null,
    ].filter((flag) => flag !== null);
    lines.push(
      `${MARK[change.action]} ${change.action.toUpperCase()} ${change.logicalId} (${change.resourceType})${flags.length === 0 ? "" : ` [${flags.join(", ")}]`}`,
    );
    if (change.properties.length > 0) lines.push(`      changed: ${change.properties.join(", ")}`);
    if (change.note !== undefined) lines.push(`      note: ${change.note}`);
  }
  if (diff.limitations.length > 0)
    lines.push("", "Limitations:", ...diff.limitations.map((l) => `  - ${l}`));
  return lines.join("\n");
}

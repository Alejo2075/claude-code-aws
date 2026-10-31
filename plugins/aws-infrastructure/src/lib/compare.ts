import {
  type AnalysisReport,
  buildReport,
  type ExecutionContext,
  type Finding,
  makeFinding,
  type TemplateChange,
  type TemplateDiff,
} from "@claude-code-aws/report-contract";
import { diffTemplates, summarizeChanges, type Template } from "@claude-code-aws/template-analysis";

import type { LoadedStack } from "@claude-code-aws/template-analysis/node";

const PLUGIN = "aws-infrastructure";
const DOC_REPLACE =
  "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html";
const DOC_DELETION =
  "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html";

export interface CompareInput {
  baseline: LoadedStack[];
  candidate: LoadedStack[];
  baselineLabel: string;
  candidateLabel: string;
  context: ExecutionContext;
  now?: Date;
}

export const TEMPLATE_LIMITATIONS = [
  "This compares templates only. Whether CloudFormation replaces a resource can depend on values it resolves at deploy time; a change set (cdk diff --method=change-set) confirms it, and creating one needs your approval.",
  "A rename is detected by similarity and can be wrong in either direction.",
  "Resources of types outside the replacement catalog and custom resources are reported as unknown, not as safe.",
];

/** Compares stacks pairwise by name. Added and removed stacks are reported as notes. */
export function compareStacks(input: CompareInput): { diff: TemplateDiff; notes: string[] } {
  const changes: TemplateChange[] = [];
  const notes: string[] = [];
  const multiple = input.baseline.length > 1 || input.candidate.length > 1;
  const before = new Map(input.baseline.map((stack) => [stack.name, stack.template]));
  const after = new Map(input.candidate.map((stack) => [stack.name, stack.template]));
  const prefix = (name: string, change: TemplateChange): TemplateChange =>
    multiple ? { ...change, logicalId: `${name}/${change.logicalId}` } : change;
  // A single template on each side is compared even if the names differ (a file against another file).
  const pairs: Array<[string, Template, Template]> = [];
  if (input.baseline.length === 1 && input.candidate.length === 1) {
    pairs.push([
      input.candidate[0]?.name ?? "",
      (input.baseline[0] as LoadedStack).template,
      (input.candidate[0] as LoadedStack).template,
    ]);
  } else {
    for (const [name, template] of after) {
      const old = before.get(name);
      if (old === undefined)
        notes.push(`Stack ${name} is new: all of its resources would be created.`);
      else pairs.push([name, old, template]);
    }
    for (const name of before.keys()) {
      if (!after.has(name))
        notes.push(
          `Stack ${name} is not in the candidate: deploying would not remove it, but it is gone from the app.`,
        );
    }
  }
  for (const [name, old, template] of pairs) {
    for (const change of diffTemplates(old, template)) changes.push(prefix(name, change));
  }
  const diff: TemplateDiff = {
    schemaVersion: "1",
    plugin: PLUGIN,
    generatedAt: (input.now ?? new Date()).toISOString(),
    context: input.context,
    method: "template",
    baseline: input.baselineLabel,
    candidate: input.candidateLabel,
    changes,
    summary: summarizeChanges(changes),
    limitations: [...TEMPLATE_LIMITATIONS, ...notes],
  };
  return { diff, notes };
}

/** Findings for the changes that deserve a decision before deploying. */
export function diffFindings(changes: readonly TemplateChange[]): Finding[] {
  const findings: Finding[] = [];
  for (const change of changes) {
    const subject = change.logicalId;
    const base = {
      plugin: PLUGIN,
      source: "static" as const,
      status: "confirmed" as const,
      affectedResources: [subject],
      subject,
    };
    const evidence = [
      { type: "template", reference: `diff#${subject}` },
      { type: "doc", reference: DOC_REPLACE },
    ];
    if ((change.action === "replace" || change.action === "possible-replace") && change.stateful) {
      findings.push(
        makeFinding({
          ...base,
          ruleId: "INFRA-DIFF-STATEFUL-REPLACE",
          severity: change.action === "replace" ? "high" : "medium",
          title:
            change.action === "replace"
              ? "A stateful resource would be replaced"
              : "A stateful resource might be replaced",
          explanation:
            `${subject} (${change.resourceType}) changes ${change.properties.join(", ")}. ${change.note ?? ""}`.trim(),
          recommendation:
            "Confirm with a change set, and plan the data migration or keep the old resource (UpdateReplacePolicy Retain) before deploying.",
          evidence,
        }),
      );
    } else if (change.action === "replace" || change.action === "possible-replace") {
      findings.push(
        makeFinding({
          ...base,
          ruleId: "INFRA-DIFF-REPLACE",
          severity: "low",
          title:
            change.action === "replace"
              ? "A resource would be replaced"
              : "A resource might be replaced",
          explanation:
            `${subject} (${change.resourceType}) changes ${change.properties.join(", ")}. ${change.note ?? ""}`.trim(),
          evidence,
        }),
      );
    }
    if (change.action === "delete" && change.stateful) {
      findings.push(
        makeFinding({
          ...base,
          ruleId: "INFRA-DIFF-STATEFUL-DELETE",
          severity: change.retained === true ? "low" : "high",
          title:
            change.retained === true
              ? "A stateful resource leaves the template (retained)"
              : "A stateful resource would be deleted",
          explanation:
            `${subject} (${change.resourceType}) is no longer in the template. ${change.note ?? ""}`.trim(),
          recommendation:
            "If this is a rename, keep the old logical id (for example with overrideLogicalId) so CloudFormation does not delete and recreate it.",
          evidence: [
            { type: "template", reference: `diff#${subject}` },
            { type: "doc", reference: DOC_DELETION },
          ],
        }),
      );
    }
    if (change.action === "create" && change.note?.startsWith("Possible rename") === true) {
      findings.push(
        makeFinding({
          ...base,
          ruleId: "INFRA-DIFF-POSSIBLE-RENAME",
          severity: change.stateful ? "high" : "medium",
          title: "A logical id changed",
          explanation: `${subject} looks like a renamed resource. ${change.note}`,
          recommendation:
            "Changing a construct id changes the logical id, so CloudFormation deletes and creates. Restore the id or pin it with overrideLogicalId.",
          evidence,
        }),
      );
    }
    if (
      change.properties.includes("DeletionPolicy") ||
      change.properties.includes("UpdateReplacePolicy")
    ) {
      findings.push(
        makeFinding({
          ...base,
          ruleId: "INFRA-DIFF-POLICY-CHANGED",
          severity: change.stateful ? "medium" : "low",
          title: "A deletion or replacement policy changed",
          explanation: `${subject} changes ${change.properties.filter((p) => p.endsWith("Policy")).join(", ")}.`,
          evidence: [
            { type: "template", reference: `diff#${subject}` },
            { type: "doc", reference: DOC_DELETION },
          ],
        }),
      );
    }
    if (change.action === "unknown") {
      findings.push(
        makeFinding({
          ...base,
          ruleId: "INFRA-DIFF-UNKNOWN-IMPACT",
          severity: "info",
          status: "informational",
          title: "The effect of a change cannot be established",
          explanation: `${subject} (${change.resourceType}): ${change.note ?? "unknown"}`,
          evidence,
        }),
      );
    }
  }
  return findings;
}

export function diffReport(diff: TemplateDiff, findings: Finding[]): AnalysisReport {
  const { summary } = diff;
  const risky = findings.filter(
    (finding) => finding.severity === "high" || finding.severity === "critical",
  ).length;
  return buildReport({
    plugin: PLUGIN,
    context: diff.context,
    mode: "local",
    summary: `${summary.create} to create, ${summary.update} to update, ${summary.replace} to replace, ${summary.possibleReplace} possibly replaced, ${summary.delete} to delete. ${risky === 0 ? "No high-risk change found." : `${risky} high-risk finding(s).`}`,
    findings,
    limitations: diff.limitations,
    now: new Date(diff.generatedAt),
  });
}

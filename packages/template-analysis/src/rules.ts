import { type Finding, makeFinding, type Severity } from "@claude-code-aws/report-contract";

import type { Template } from "./types.js";

export interface RuleHit {
  logicalId?: string;
  explanation: string;
  /** More specific location than the resource, such as a statement path. */
  at?: string;
  affected?: string[];
}

export interface Rule {
  /** Stable identifier, for example `SEC-IAM-WILDCARD-ACTION`. */
  id: string;
  /** The pack it belongs to: `iac-quality` or `security`. */
  pack: string;
  severity: Severity;
  title: string;
  /** Why it matters, in a sentence. */
  rationale: string;
  /** Official documentation that supports the rule. */
  source: string;
  recommendation?: string;
  check: (template: Template) => RuleHit[];
}

export interface NamedTemplate {
  /** A label for evidence: a file name or a stack name. */
  name: string;
  template: Template;
}

export interface Exclusion {
  ruleId: string;
  /** Logical id, or `*` for every resource. */
  logicalId: string;
}

/** Runs rules over templates and returns static, confirmed findings with evidence references. */
export function runRules(
  plugin: string,
  rules: readonly Rule[],
  templates: readonly NamedTemplate[],
  options: { exclusions?: readonly Exclusion[] } = {},
): { findings: Finding[]; suppressed: number } {
  const findings: Finding[] = [];
  let suppressed = 0;
  for (const { name, template } of templates) {
    for (const rule of rules) {
      for (const hit of rule.check(template)) {
        const excluded = (options.exclusions ?? []).some(
          (exclusion) =>
            exclusion.ruleId === rule.id &&
            (exclusion.logicalId === "*" || exclusion.logicalId === hit.logicalId),
        );
        if (excluded) {
          suppressed += 1;
          continue;
        }
        const location =
          hit.at ?? (hit.logicalId === undefined ? "" : `Resources/${hit.logicalId}`);
        findings.push(
          makeFinding({
            ruleId: rule.id,
            plugin,
            severity: rule.severity,
            status: "confirmed",
            source: "static",
            title: rule.title,
            explanation: `${hit.explanation} ${rule.rationale}`,
            subject: `${name}#${hit.at ?? hit.logicalId ?? ""}`,
            affectedResources: hit.affected ?? (hit.logicalId === undefined ? [] : [hit.logicalId]),
            evidence: [
              { type: "template", reference: `${name}#/${location}` },
              { type: "doc", reference: rule.source },
            ],
            ...(rule.recommendation === undefined ? {} : { recommendation: rule.recommendation }),
          }),
        );
      }
    }
  }
  return { findings, suppressed };
}

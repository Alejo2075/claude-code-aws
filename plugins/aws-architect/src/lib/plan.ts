// The architecture plan handed to aws-infrastructure. Either plugin works without the other: the plan
// is a JSON document with a schema version, validated here and read there.
import { type ArchitecturePlan, planCodec, SCHEMA_VERSION } from "@claude-code-aws/report-contract";

import { checkIntake } from "./intake.js";

export function initPlan(
  title: string,
  requirements: Record<string, string>,
  now: Date,
): ArchitecturePlan {
  const intake = checkIntake(requirements);
  return {
    schemaVersion: SCHEMA_VERSION,
    title: title.trim().slice(0, 120) || "Untitled plan",
    generatedAt: now.toISOString(),
    requirements: Object.fromEntries(
      [...intake.answered.map((a) => [a.key, a.answer] as const)].concat(
        intake.unknownKeys.map((key) => [key, (requirements[key] ?? "").slice(0, 600)] as const),
      ),
    ),
    components: [],
    integrations: [],
    assumptions: intake.missing.map(
      (q) => `Not stated: ${q.key}. Assumed nothing; to be confirmed.`,
    ),
    risks: [],
    openQuestions: intake.missing.map((q) => q.question),
  };
}

export type PlanCheck =
  { ok: true; plan: ArchitecturePlan; warnings: string[] } | { ok: false; error: string };

/** Validates a plan document and reports consistency problems the schema cannot express. */
export function checkPlan(text: string): PlanCheck {
  const parsed = planCodec.parse(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const plan = parsed.value;
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const component of plan.components) {
    if (ids.has(component.id))
      warnings.push(`Component id "${component.id}" is used more than once.`);
    ids.add(component.id);
  }
  for (const link of plan.integrations) {
    for (const end of [link.from, link.to])
      if (!ids.has(end)) warnings.push(`Integration refers to "${end}", which is not a component.`);
  }
  if (plan.components.length === 0) warnings.push("The plan has no components yet.");
  if (plan.openQuestions.length > 0)
    warnings.push(
      `${plan.openQuestions.length} open question(s) remain; the design rests on assumptions.`,
    );
  return { ok: true, plan, warnings };
}

export function renderPlan(plan: ArchitecturePlan, warnings: readonly string[]): string {
  const lines = [
    `Plan: ${plan.title} (generated ${plan.generatedAt})`,
    `  ${plan.components.length} component(s), ${plan.integrations.length} integration(s), ${plan.assumptions.length} assumption(s), ${plan.risks.length} risk(s), ${plan.openQuestions.length} open question(s)`,
  ];
  for (const warning of warnings) lines.push(`  - ${warning}`);
  return lines.join("\n");
}

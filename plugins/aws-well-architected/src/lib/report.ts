import { PILLARS } from "@claude-code-aws/lens-questions";

import { type ReviewDocument, type Status } from "./model.js";

const STATUS_LABEL: Record<Status, string> = {
  evidenced: "evidenced",
  partial: "partly",
  gap: "gap",
  unknown: "no evidence",
  "not-applicable": "n/a",
};

export function renderReview(r: ReviewDocument): string {
  const lines = [
    `Well-Architected style review: ${r.scope.name} (${r.scope.criticality}, ${r.scope.environment}, architecture ${r.scope.architectureVersion})`,
    r.disclaimer,
    "",
    `Coverage: ${r.coverage.withEvidence} of ${r.coverage.questions} questions have any evidence; ${r.coverage.verified} are backed by verified (account) evidence.`,
    "",
    "By pillar (counts, not scores):",
  ];
  for (const pillar of PILLARS) {
    const c = r.byPillar[pillar];
    lines.push(
      `  ${pillar.padEnd(24)} ${(["evidenced", "partial", "gap", "unknown", "not-applicable"] as const).map((s) => `${STATUS_LABEL[s]} ${c[s]}`).join(", ")}`,
    );
  }
  if (r.backlog.length > 0) {
    lines.push("", "Improvement backlog (highest priority first):");
    for (const item of r.backlog) {
      lines.push(
        `  ${item.priority} [${item.pillar}] ${item.questionId} (${item.status}, effort ${item.effort}, owner ${item.owner})`,
        `      Risk: ${item.risk}`,
        `      Do: ${item.action}`,
        `      Verify: ${item.verify}`,
        ...item.evidence.map((e) => `      Evidence: ${e}`),
        ...(item.specialist === null ? [] : [`      Follow up with: ${item.specialist}`]),
      );
    }
  }
  const conflicts = r.questions.filter((q) => q.conflict);
  if (conflicts.length > 0) {
    lines.push("", "Evidence that disagrees (treated as a gap until resolved):");
    for (const q of conflicts)
      lines.push(`  ${q.id}: ${q.evidence.map((e) => `${e.kind} says ${e.polarity}`).join("; ")}`);
  }
  const stale = r.questions.flatMap((q) => q.evidence.filter((e) => e.stale).map(() => q.id));
  if (stale.length > 0)
    lines.push(
      "",
      `Evidence older than ${r.scope.evidenceWindowDays} days: ${[...new Set(stale)].join(", ")}`,
    );
  if (r.missing.length > 0) {
    lines.push("", `Missing evidence (${r.missing.length}): these are unknown, not met.`);
    for (const m of r.missing)
      lines.push(
        `  ${m.questionId} [${m.pillar}] ${m.text}\n      Who: ${m.whoCanAnswer}. ${m.howToGetIt}`,
      );
  }
  if (r.unmappedFindings.length > 0) {
    lines.push(
      "",
      "Specialist findings that map to no question (kept for follow-up):",
      ...r.unmappedFindings.map((f) => `  ${f}`),
    );
  }
  lines.push("", "Limitations:", ...r.limitations.map((l) => `  - ${l}`));
  return lines.join("\n");
}

export function renderImprovementPlan(r: ReviewDocument): string {
  const lines = [
    `# Improvement plan: ${r.scope.name}`,
    "",
    `Generated ${r.generatedAt} from a review of architecture ${r.scope.architectureVersion}.`,
    "",
    `> ${r.disclaimer}`,
    "",
  ];
  for (const priority of ["P1", "P2", "P3"] as const) {
    const items = r.backlog.filter((b) => b.priority === priority);
    if (items.length === 0) continue;
    lines.push(`## ${priority}`, "");
    for (const b of items) {
      lines.push(
        `### ${b.questionId}: ${r.questions.find((q) => q.id === b.questionId)?.text ?? ""}`,
        "",
        `- Pillar: ${b.pillar}; status: ${b.status}; effort: ${b.effort} (rough); owner: ${b.owner}`,
        `- Risk: ${b.risk}`,
        `- Action: ${b.action}`,
        `- Done when: ${b.verify}`,
        ...b.evidence.map((e) => `- Evidence: ${e}`),
        ...(b.specialist === null ? [] : [`- Investigate with: ${b.specialist}`]),
        "",
      );
    }
  }
  if (r.backlog.length === 0)
    lines.push(
      "No gaps were found in the evidence that exists. That is not a statement about questions with no evidence (below).",
      "",
    );
  if (r.missing.length > 0) {
    lines.push("## Evidence to collect first", "");
    for (const m of r.missing) lines.push(`- ${m.questionId} (${m.pillar}): ${m.howToGetIt}`);
  }
  return lines.join("\n");
}

export interface Comparison {
  resolved: string[];
  regressed: string[];
  stillOpen: string[];
  newlyEvidenced: string[];
  newQuestions: string[];
  removedQuestions: string[];
  unchanged: number;
}

const OPEN: Status[] = ["gap", "partial"];

export function compareReviews(before: ReviewDocument, after: ReviewDocument): Comparison {
  const b = new Map(before.questions.map((q) => [q.id, q]));
  const out: Comparison = {
    resolved: [],
    regressed: [],
    stillOpen: [],
    newlyEvidenced: [],
    newQuestions: [],
    removedQuestions: [],
    unchanged: 0,
  };
  for (const q of after.questions) {
    const old = b.get(q.id);
    if (old === undefined) {
      out.newQuestions.push(q.id);
      continue;
    }
    if (OPEN.includes(old.status) && q.status === "evidenced") out.resolved.push(q.id);
    else if (old.status === "evidenced" && (OPEN.includes(q.status) || q.status === "unknown"))
      out.regressed.push(q.id);
    else if (OPEN.includes(old.status) && OPEN.includes(q.status)) out.stillOpen.push(q.id);
    else if (old.status === "unknown" && q.status !== "unknown") out.newlyEvidenced.push(q.id);
    else out.unchanged += 1;
  }
  const a = new Set(after.questions.map((q) => q.id));
  out.removedQuestions = before.questions.filter((q) => !a.has(q.id)).map((q) => q.id);
  return out;
}

export function renderComparison(
  c: Comparison,
  before: ReviewDocument,
  after: ReviewDocument,
): string {
  const list = (title: string, ids: string[]): string[] =>
    ids.length === 0 ? [] : [`${title} (${ids.length}): ${ids.join(", ")}`];
  return [
    `Comparing ${before.generatedAt} with ${after.generatedAt}`,
    ...list("Resolved", c.resolved),
    ...list("Regressed", c.regressed),
    ...list("Still open", c.stillOpen),
    ...list("Now have evidence", c.newlyEvidenced),
    ...list("New questions", c.newQuestions),
    ...list("Questions no longer asked", c.removedQuestions),
    `Unchanged: ${c.unchanged}`,
    'A question moves to "resolved" only when evidence now supports it; it does not prove the practice works.',
  ].join("\n");
}

// Deprecated: the Well-Architected style review is owned by `aws-well-architected`. This keeps
// `/aws-architect:review` working with the same question bank (packages/lens-questions), limited to
// the eleven questions it always had, until the next major version.
import { QUESTIONS, type TemplateAnswer } from "@claude-code-aws/lens-questions";
import type { Template } from "@claude-code-aws/template-analysis";

export type Answer = TemplateAnswer;

const LEGACY = new Set([
  "REL-DLQ",
  "REL-VISIBILITY",
  "REL-IDEMPOTENCY",
  "OPS-TRACING",
  "OPS-ALARMS",
  "OPS-LOG-RETENTION",
  "SEC-AUTHZ",
  "SEC-LEAST-PRIVILEGE",
  "SEC-PUBLIC-EXPOSURE",
  "PERF-MEMORY",
  "COST-ON-DEMAND",
]);

export const REVIEW_DEPRECATION =
  "Deprecated: the Well-Architected style review moved to the aws-well-architected plugin (/aws-well-architected:review), which covers all six pillars with an evidence ledger. This command keeps working for now.";

export interface Review {
  answered: Array<{
    id: string;
    pillar: string;
    question: string;
    answer: Answer;
    evidence: string;
    source: string;
  }>;
  needsOthers: string[];
}

export function review(template: Template, now: Date = new Date()): Review {
  const answered = QUESTIONS.filter((q) => LEGACY.has(q.id)).map((q) => {
    const result = q.evaluate?.(template, now);
    return {
      id: q.id,
      pillar: q.pillar,
      question: q.text,
      source: q.source,
      answer: result?.answer ?? ("not-in-template" as const),
      evidence: result?.evidence ?? q.notInTemplate ?? "A template cannot answer this.",
    };
  });
  return {
    answered,
    needsOthers: [
      "Sustainability, most of Performance, and the organizational parts of Operational Excellence cannot be answered from a template.",
      "The Serverless Lens has many more questions than these; this is a subset that a template can speak to. Run the full review with your team.",
      REVIEW_DEPRECATION,
    ],
  };
}

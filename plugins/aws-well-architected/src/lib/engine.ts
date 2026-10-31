import {
  PILLARS,
  QUESTIONS,
  type LensQuestion,
  type TemplateAnswer,
} from "@claude-code-aws/lens-questions";
import type { AnalysisReport } from "@claude-code-aws/report-contract";
import { redactText } from "@claude-code-aws/safe-output";
import type { Template } from "@claude-code-aws/template-analysis";

import {
  type BacklogItem,
  type EvidenceKind,
  type EvidenceRecord,
  type MissingItem,
  type Polarity,
  type Priority,
  type QuestionResult,
  type ReviewDocument,
  type Scope,
  type Status,
  DISCLAIMER,
  emptyByPillar,
  KIND_RANK,
} from "./model.js";

export interface SelfAnswer {
  questionId: string;
  answer: "yes" | "partly" | "no" | "not-applicable";
  note?: string;
  answeredBy?: string;
  answeredAt?: string;
}

/** Which question a specialist finding informs. Matching is by exact id or prefix; unmatched findings are listed, not dropped. */
const SPECIALIST_MAP: ReadonlyArray<readonly [string, string]> = [
  ["SEC-APIGW-UNAUTHENTICATED-ROUTE", "SEC-AUTHZ"],
  ["SEC-IAM-", "SEC-LEAST-PRIVILEGE"],
  ["SEC-S3-PUBLIC-ACCESS-BLOCK", "SEC-PUBLIC-EXPOSURE"],
  ["SEC-RES-PUBLIC-PRINCIPAL", "SEC-PUBLIC-EXPOSURE"],
  ["SEC-SNS-NO-ENCRYPTION", "SEC-TOPIC-ENCRYPTION"],
  ["SEC-LAMBDA-RUNTIME-UNSUPPORTED", "SEC-RUNTIME-SUPPORT"],
  ["SEC-LAMBDA-SECRET-ENV", "SEC-SECRETS"],
  ["OBS-NO-DLQ", "REL-DLQ"],
  ["OBS-NO-TRACING", "OPS-TRACING"],
  ["OBS-LAMBDA-TIMEOUT", "PERF-MEMORY"],
  ["OBS-LAMBDA-MEMORY", "PERF-MEMORY"],
  ["OBS-LAMBDA-THROTTLED", "REL-QUOTAS"],
  ["OBS-LAMBDA-COLD-STARTS", "PERF-COLD-START"],
];

export function questionFor(ruleId: string): string | null {
  for (const [prefix, id] of SPECIALIST_MAP)
    if (ruleId === prefix || (prefix.endsWith("-") && ruleId.startsWith(prefix))) return id;
  return null;
}

const DAY = 86_400_000;
const staleAfter = (scope: Scope, at: string | null, now: Date): boolean => {
  if (at === null) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && (now.getTime() - t) / DAY > scope.evidenceWindowDays;
};
const clean = (text: string, max = 300): string => redactText(text).text.slice(0, max);

function combine(parts: TemplateAnswer[]): TemplateAnswer {
  const real = parts.filter((a) => a !== "not-in-template");
  if (real.length === 0) return "not-in-template";
  if (real.every((a) => a === "yes")) return "yes";
  if (real.every((a) => a === "no")) return "no";
  return "partly";
}

const polarityOf = (a: "yes" | "partly" | "no"): Polarity =>
  a === "yes" ? "supports" : a === "no" ? "gap" : "partial";

export interface ReviewInput {
  scope: Scope;
  stacks: ReadonlyArray<{ name: string; template: Template }>;
  answers: readonly SelfAnswer[];
  reports: readonly AnalysisReport[];
  now: Date;
}

function templateEvidence(q: LensQuestion, input: ReviewInput): EvidenceRecord | null {
  if (q.evaluate === undefined || input.stacks.length === 0) return null;
  const results = input.stacks.map((s) => ({
    name: s.name,
    result: q.evaluate?.(s.template, input.now),
  }));
  const answers = results.flatMap((r) => (r.result === undefined ? [] : [r.result.answer]));
  const answer = combine(answers);
  if (answer === "not-in-template") return null;
  return {
    kind: "automated-inference",
    polarity: polarityOf(answer),
    statement: results.map((r) => `${r.name}: ${r.result?.evidence ?? ""}`).join(" | "),
    reference: "synthesized templates (declared, not deployed)",
    observedAt: null,
    stale: false,
  };
}

function reportEvidence(q: LensQuestion, input: ReviewInput): EvidenceRecord[] {
  const out: EvidenceRecord[] = [];
  for (const report of input.reports)
    for (const finding of report.findings) {
      if (questionFor(finding.ruleId) !== q.id) continue;
      const verified =
        report.mode === "read-only-cloud" &&
        finding.source === "account" &&
        finding.status === "confirmed";
      out.push({
        kind: verified ? "verified" : "automated-inference",
        polarity: "gap",
        statement: clean(`${finding.ruleId}: ${finding.title}`),
        reference: `${report.plugin} report of ${report.generatedAt}`,
        observedAt: report.generatedAt,
        stale: staleAfter(input.scope, report.generatedAt, input.now),
      });
    }
  return out;
}

function answerEvidence(
  q: LensQuestion,
  input: ReviewInput,
): { records: EvidenceRecord[]; notApplicable: boolean } {
  const records: EvidenceRecord[] = [];
  let notApplicable = false;
  for (const a of input.answers) {
    if (a.questionId !== q.id) continue;
    if (a.answer === "not-applicable") {
      notApplicable = true;
      continue;
    }
    const who = a.answeredBy === undefined ? "" : ` by ${clean(a.answeredBy, 60)}`;
    records.push({
      kind: "self-reported",
      polarity: polarityOf(a.answer),
      statement: clean(`Answered "${a.answer}"${who}${a.note === undefined ? "" : `: ${a.note}`}`),
      reference: "answers file",
      observedAt: a.answeredAt ?? null,
      stale: staleAfter(input.scope, a.answeredAt ?? null, input.now),
    });
  }
  return { records, notApplicable };
}

function resolve(
  records: EvidenceRecord[],
  notApplicable: boolean,
): { status: Status; strongest: EvidenceKind | null; conflict: boolean } {
  if (records.length === 0)
    return {
      status: notApplicable ? "not-applicable" : "unknown",
      strongest: null,
      conflict: false,
    };
  const strongest = records.reduce<EvidenceKind>(
    (best, r) => (KIND_RANK[r.kind] > KIND_RANK[best] ? r.kind : best),
    "self-reported",
  );
  const hasGap = records.some((r) => r.polarity === "gap");
  const hasPartial = records.some((r) => r.polarity === "partial");
  const hasSupport = records.some((r) => r.polarity === "supports");
  const conflict = hasSupport && (hasGap || hasPartial);
  // Any evidence of a gap wins: a practice is not met because one source says it is.
  const status: Status = hasGap ? "gap" : hasPartial ? "partial" : "evidenced";
  return { status, strongest, conflict };
}

export function priorityFor(q: LensQuestion, scope: Scope): Priority {
  const raised =
    (scope.criticality === "high" || scope.criticality === "mission-critical") &&
    (q.pillar === "security" || q.pillar === "reliability");
  const base = q.impact === "high" ? 1 : q.impact === "medium" ? 2 : 3;
  return `P${raised ? Math.max(1, base - 1) : base}` as Priority;
}

const HOW: Record<string, string> = {
  "aws-security":
    "Run /aws-security:review on the code, then its account checks if you have read access.",
  "aws-observability":
    "Run /aws-observability:status and :investigate for the function or queue, with a time window.",
  "aws-cost":
    "Run /aws-cost:estimate or :compare with measured numbers, and check budgets in the account.",
  "aws-infrastructure": "Run /aws-infrastructure:review on the synthesized app.",
  "aws-testing": "Run the tests (/aws-testing:run) and check coverage of failure cases.",
};

export function runReview(input: ReviewInput): ReviewDocument {
  const questions: QuestionResult[] = [];
  const backlog: BacklogItem[] = [];
  const missing: MissingItem[] = [];
  const byPillar = emptyByPillar();
  const mappedIds = new Set<string>(QUESTIONS.map((q) => q.id));
  for (const q of QUESTIONS) {
    const answers = answerEvidence(q, input);
    const template = templateEvidence(q, input);
    const records = [
      ...(template === null ? [] : [template]),
      ...reportEvidence(q, input),
      ...answers.records,
    ];
    const { status, strongest, conflict } = resolve(records, answers.notApplicable);
    questions.push({
      id: q.id,
      pillar: q.pillar,
      lens: q.lens,
      text: q.text,
      source: q.source,
      status,
      strongest,
      conflict,
      evidence: records,
    });
    byPillar[q.pillar][status] += 1;
    if (status === "gap" || status === "partial")
      backlog.push({
        questionId: q.id,
        pillar: q.pillar,
        priority: priorityFor(q, input.scope),
        status,
        risk: q.risk,
        action: q.action,
        effort: q.effort,
        verify: q.verify,
        owner: input.scope.owner === "" ? "unassigned" : input.scope.owner,
        specialist: q.specialist ?? null,
        evidence: records.filter((r) => r.polarity !== "supports").map((r) => r.statement),
      });
    if (status === "unknown")
      missing.push({
        questionId: q.id,
        pillar: q.pillar,
        text: q.text,
        whoCanAnswer: q.specialist ?? "the team that owns the workload",
        howToGetIt:
          q.specialist === undefined
            ? (q.notInTemplate ?? "Answer it in the answers file.")
            : `${HOW[q.specialist] ?? ""} Or answer it in the answers file.`.trim(),
      });
  }
  backlog.sort(
    (a, b) =>
      a.priority.localeCompare(b.priority) ||
      a.pillar.localeCompare(b.pillar) ||
      a.questionId.localeCompare(b.questionId),
  );
  const unmapped: string[] = [];
  for (const report of input.reports)
    for (const finding of report.findings) {
      const target = questionFor(finding.ruleId);
      if (target === null || !mappedIds.has(target))
        unmapped.push(clean(`${report.plugin} ${finding.ruleId}: ${finding.title}`));
    }
  const withEvidence = questions.filter((x) => x.evidence.length > 0).length;
  return {
    schemaVersion: "1",
    kind: "WellArchitectedReview",
    generatedAt: input.now.toISOString(),
    scope: input.scope,
    disclaimer: DISCLAIMER,
    coverage: {
      questions: questions.length,
      withEvidence,
      verified: questions.filter((x) => x.strongest === "verified").length,
    },
    byPillar,
    questions,
    backlog,
    missing,
    unmappedFindings: unmapped,
    limitations: [
      "Templates show what is defined, not what is deployed. A passing template check is an automated inference, not verification.",
      "Self-reported answers are recorded as stated and not checked.",
      "A specialist report with no finding for a question is not evidence that the practice is met.",
      "Impact and effort per question are authored estimates, not measurements. Priority follows impact, raised one level for security and reliability when the workload is high or mission critical.",
      `Covers ${PILLARS.length} pillars with ${QUESTIONS.length} questions paraphrased from the pillar guidance; the official framework has many more.`,
    ],
  };
}

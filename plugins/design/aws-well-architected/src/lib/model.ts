import { PILLARS, type Pillar } from "@claude-code-aws/lens-questions";

export type Criticality = "low" | "medium" | "high" | "mission-critical";
export const CRITICALITIES: readonly Criticality[] = ["low", "medium", "high", "mission-critical"];

export interface Scope {
  name: string;
  criticality: Criticality;
  environment: string;
  architectureVersion: string;
  dataClassification: string;
  evidenceWindowDays: number;
  owner: string;
  stakeholders: string[];
  dependencies: string[];
  constraints: string[];
  knownUnknowns: string[];
}

/**
 * verified            - read from the account by a specialist plugin
 * automated-inference - derived from code, templates, or a static report
 * self-reported       - stated by a person; not checked
 */
export type EvidenceKind = "verified" | "automated-inference" | "self-reported";
export const KIND_RANK: Record<EvidenceKind, number> = {
  verified: 3,
  "automated-inference": 2,
  "self-reported": 1,
};

export type Polarity = "supports" | "gap" | "partial";

export interface EvidenceRecord {
  kind: EvidenceKind;
  polarity: Polarity;
  statement: string;
  reference: string;
  observedAt: string | null;
  stale: boolean;
}

/** `evidenced` is never `compliant`: it means the evidence we have supports the practice, at the strength shown. */
export type Status = "evidenced" | "partial" | "gap" | "unknown" | "not-applicable";

export interface QuestionResult {
  id: string;
  pillar: Pillar;
  lens: "framework" | "serverless";
  text: string;
  source: string;
  status: Status;
  strongest: EvidenceKind | null;
  conflict: boolean;
  evidence: EvidenceRecord[];
}

export type Priority = "P1" | "P2" | "P3";

export interface BacklogItem {
  questionId: string;
  pillar: Pillar;
  priority: Priority;
  status: "gap" | "partial";
  risk: string;
  action: string;
  effort: "S" | "M" | "L";
  verify: string;
  owner: string;
  specialist: string | null;
  evidence: string[];
}

export interface MissingItem {
  questionId: string;
  pillar: Pillar;
  text: string;
  whoCanAnswer: string;
  howToGetIt: string;
}

export interface ReviewDocument {
  schemaVersion: "1";
  kind: "WellArchitectedReview";
  generatedAt: string;
  scope: Scope;
  disclaimer: string;
  coverage: { questions: number; withEvidence: number; verified: number };
  byPillar: Record<Pillar, Record<Status, number>>;
  questions: QuestionResult[];
  backlog: BacklogItem[];
  missing: MissingItem[];
  unmappedFindings: string[];
  limitations: string[];
}

export const DISCLAIMER =
  "This is an evidence review in the spirit of the AWS Well-Architected Framework and the Serverless Applications Lens. It is not an official AWS Well-Architected Framework Review, it produces no score, and it does not certify anything. Evidence we did not see is reported as missing, never as met.";

export const emptyCounts = (): Record<Status, number> => ({
  evidenced: 0,
  partial: 0,
  gap: 0,
  unknown: 0,
  "not-applicable": 0,
});

export const emptyByPillar = (): ReviewDocument["byPillar"] =>
  Object.fromEntries(PILLARS.map((p) => [p, emptyCounts()])) as ReviewDocument["byPillar"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Accepts a review document written by this plugin; rejects anything else. */
export function parseReview(
  value: unknown,
): { ok: true; review: ReviewDocument } | { ok: false; error: string } {
  if (
    !isRecord(value) ||
    value["schemaVersion"] !== "1" ||
    value["kind"] !== "WellArchitectedReview"
  )
    return { ok: false, error: "not a Well-Architected review document" };
  if (
    !Array.isArray(value["questions"]) ||
    !Array.isArray(value["backlog"]) ||
    !isRecord(value["scope"])
  )
    return { ok: false, error: "the review document is incomplete" };
  for (const q of value["questions"]) {
    if (!isRecord(q) || typeof q["id"] !== "string" || typeof q["status"] !== "string")
      return { ok: false, error: "a question entry is malformed" };
  }
  return { ok: true, review: value as unknown as ReviewDocument };
}

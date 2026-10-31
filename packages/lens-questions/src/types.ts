import type { Template } from "@claude-code-aws/template-analysis";

export const PILLARS = [
  "operational-excellence",
  "security",
  "reliability",
  "performance",
  "cost",
  "sustainability",
] as const;
export type Pillar = (typeof PILLARS)[number];

export type TemplateAnswer = "yes" | "partly" | "no" | "not-in-template";

export interface TemplateResult {
  answer: TemplateAnswer;
  evidence: string;
}

export interface LensQuestion {
  id: string;
  pillar: Pillar;
  /** Questions are our own paraphrase of the pillar guidance, not the official WAFR question text. */
  text: string;
  /** `serverless` questions come from the Serverless Applications Lens guidance; others from the framework. */
  lens: "framework" | "serverless";
  /** A page that supports the question. */
  source: string;
  /** Authored judgement of how bad a gap usually is, not a measurement. */
  impact: "high" | "medium" | "low";
  /** Rough effort to close a gap: S = hours, M = days, L = weeks. An authored estimate. */
  effort: "S" | "M" | "L";
  risk: string;
  action: string;
  verify: string;
  /** The plugin that investigates this in depth. */
  specialist?:
    "aws-security" | "aws-cost" | "aws-observability" | "aws-infrastructure" | "aws-testing";
  /** Present when a synthesized template can answer (partly) from what it declares. */
  evaluate?: (template: Template, now: Date) => TemplateResult;
  /** Why a template cannot answer, for questions without `evaluate`. */
  notInTemplate?: string;
}

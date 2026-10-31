import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { QUESTIONS } from "@claude-code-aws/lens-questions";
import type { AnalysisReport, Finding } from "@claude-code-aws/report-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { runReview, questionFor, priorityFor } from "../src/lib/engine.js";
import { makeScope } from "../src/lib/cli.js";
import { loadStacks } from "@claude-code-aws/template-analysis/node";
import { compareReviews } from "../src/lib/report.js";
import type { Scope } from "../src/lib/model.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "tests", "fixtures", "serverless");
const NOW = new Date("2026-10-31T00:00:00Z");
const scope = (over: Partial<Scope> = {}): Scope => {
  const s = makeScope(new Map([["name", ["Orders"]]]));
  if (typeof s === "string") throw new Error(s);
  return { ...s, ...over };
};
const stacks = () => loadStacks(FIXTURES, "cdk.out.orders").stacks;
const byId = (r: ReturnType<typeof runReview>, id: string) => {
  const q = r.questions.find((x) => x.id === id);
  if (q === undefined) throw new Error(`no ${id}`);
  return q;
};
const finding = (ruleId: string, over: Partial<Finding> = {}): Finding => ({
  id: "f1",
  ruleId,
  plugin: "aws-security",
  severity: "high",
  status: "confirmed",
  source: "static",
  title: "A finding",
  explanation: "x",
  evidence: [],
  fingerprint: "fp",
  ...over,
});
const report = (findings: Finding[], mode: AnalysisReport["mode"] = "local"): AnalysisReport => ({
  schemaVersion: "1",
  plugin: "aws-security",
  generatedAt: "2026-10-30T00:00:00Z",
  context: {
    accountId: null,
    region: null,
    profile: null,
    identityVerified: false,
    environment: "unknown",
  },
  mode,
  summary: "",
  findings,
  limitations: [],
});
const input = (over = {}) => ({
  scope: scope(),
  stacks: stacks(),
  answers: [],
  reports: [],
  now: NOW,
  ...over,
});

describe("the question bank", () => {
  it("covers all six pillars, has unique ids, sources, and authored impact", () => {
    expect(new Set(QUESTIONS.map((q) => q.pillar)).size).toBe(6);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    for (const q of QUESTIONS) {
      expect(q.source, q.id).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
      expect(q.action, q.id).not.toBe("");
      expect(q.evaluate !== undefined || q.notInTemplate !== undefined, q.id).toBe(true);
    }
  });
});

describe("evidence and status", () => {
  it("with no templates and no answers, everything is unknown and nothing is met", () => {
    const r = runReview(input({ stacks: [] }));
    expect(r.questions.every((q) => q.status === "unknown")).toBe(true);
    expect(r.coverage.withEvidence).toBe(0);
    expect(r.missing).toHaveLength(QUESTIONS.length);
    expect(r.backlog).toHaveLength(0);
  });

  it("a passing template check is an automated inference, never verified", () => {
    const q = byId(runReview(input()), "REL-DLQ");
    expect(q.status).toBe("evidenced");
    expect(q.strongest).toBe("automated-inference");
    expect(q.evidence[0]?.reference).toMatch(/not deployed/);
  });

  it("a self-reported yes is kept at the weakest strength", () => {
    const r = runReview(
      input({
        stacks: [],
        answers: [{ questionId: "OPS-RUNBOOKS", answer: "yes", answeredAt: "2026-10-20" }],
      }),
    );
    expect(byId(r, "OPS-RUNBOOKS").status).toBe("evidenced");
    expect(byId(r, "OPS-RUNBOOKS").strongest).toBe("self-reported");
  });

  it("a gap anywhere wins, and the disagreement is shown", () => {
    const r = runReview(input({ answers: [{ questionId: "OPS-ALARMS", answer: "yes" }] }));
    const q = byId(r, "OPS-ALARMS");
    // The fixture has no alarms (template: no) and the team says yes.
    expect(q.status).toBe("gap");
    expect(q.conflict).toBe(true);
    expect(r.backlog.some((b) => b.questionId === "OPS-ALARMS")).toBe(true);
  });

  it("not-applicable is not a pass and not missing", () => {
    const r = runReview(
      input({ stacks: [], answers: [{ questionId: "SEC-AUTHZ", answer: "not-applicable" }] }),
    );
    expect(byId(r, "SEC-AUTHZ").status).toBe("not-applicable");
  });

  it("specialist findings become gaps; only confirmed account findings are verified", () => {
    const local = runReview(input({ reports: [report([finding("SEC-IAM-WILDCARD-ACTION")])] }));
    expect(byId(local, "SEC-LEAST-PRIVILEGE").status).toBe("gap");
    expect(byId(local, "SEC-LEAST-PRIVILEGE").strongest).toBe("automated-inference");
    const live = runReview(
      input({
        reports: [
          report([finding("SEC-IAM-WILDCARD-ACTION", { source: "account" })], "read-only-cloud"),
        ],
      }),
    );
    expect(byId(live, "SEC-LEAST-PRIVILEGE").strongest).toBe("verified");
    expect(live.coverage.verified).toBe(1);
  });

  it("a report with no findings proves nothing, and unmapped findings are kept", () => {
    const r = runReview(input({ stacks: [], reports: [report([finding("SEC-KMS-NO-ROTATION")])] }));
    expect(byId(r, "SEC-TOPIC-ENCRYPTION").status).toBe("unknown");
    expect(r.unmappedFindings.join(" ")).toContain("SEC-KMS-NO-ROTATION");
    expect(questionFor("SEC-IAM-ANYTHING")).toBe("SEC-LEAST-PRIVILEGE");
    expect(questionFor("NOPE")).toBeNull();
  });

  it("flags evidence older than the window", () => {
    const r = runReview(
      input({
        stacks: [],
        answers: [{ questionId: "OPS-RUNBOOKS", answer: "no", answeredAt: "2025-01-01" }],
      }),
    );
    expect(byId(r, "OPS-RUNBOOKS").evidence[0]?.stale).toBe(true);
  });

  it("redacts secrets in notes", () => {
    const r = runReview(
      input({
        stacks: [],
        answers: [
          { questionId: "OPS-RUNBOOKS", answer: "no", note: "key AKIAIOSFODNN7EXAMPLE leaked" },
        ],
      }),
    );
    expect(JSON.stringify(r)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});

describe("priority", () => {
  it("raises security and reliability one level for critical workloads, only", () => {
    const sec = QUESTIONS.find((q) => q.id === "SEC-TOPIC-ENCRYPTION");
    const cost = QUESTIONS.find((q) => q.id === "COST-BUDGETS");
    if (sec === undefined || cost === undefined) throw new Error("missing");
    expect(priorityFor(sec, scope({ criticality: "low" }))).toBe("P2");
    expect(priorityFor(sec, scope({ criticality: "mission-critical" }))).toBe("P1");
    expect(priorityFor(cost, scope({ criticality: "mission-critical" }))).toBe("P2");
  });
});

describe("compare", () => {
  it("reports resolved, regressed, and still-open questions", () => {
    const before = runReview(input({ answers: [{ questionId: "OPS-ALARMS", answer: "no" }] }));
    const after = runReview(
      input({
        answers: [{ questionId: "OPS-ALARMS", answer: "yes" }],
        stacks: stacks().map((s) => ({ ...s })),
      }),
    );
    const same = compareReviews(before, before);
    expect(same.resolved).toHaveLength(0);
    expect(same.stillOpen).toContain("OPS-ALARMS");
    const worse = compareReviews(
      runReview(input({ stacks: [], answers: [{ questionId: "OPS-RUNBOOKS", answer: "yes" }] })),
      runReview(input({ stacks: [], answers: [{ questionId: "OPS-RUNBOOKS", answer: "no" }] })),
    );
    expect(worse.regressed).toContain("OPS-RUNBOOKS");
    expect(after.questions.length).toBe(before.questions.length);
  });
});

describe("the command line", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aws-wa-"));
    mkdirSync(join(root, "cdk.out"));
    for (const f of ["manifest.json", "OrdersStack.template.json"])
      writeFileSync(join(root, "cdk.out", f), readFileSync(join(FIXTURES, "cdk.out.orders", f)));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const cli = (args: string[]) => runCli(args, { root, now: NOW });

  it("states what it is and never prints a score", async () => {
    const out = await cli(["review"]);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("not an official AWS Well-Architected Framework Review");
    expect(out.stdout.toLowerCase()).not.toMatch(/\bscore[: ]\s*\d|certified|compliant/);
    expect(out.stdout).toMatch(/Missing evidence/);
  });

  it("without templates the missing evidence is explicit", async () => {
    const out = await runCli(["review", "nothing-here"], { root, now: NOW });
    expect(out.stdout).toMatch(/not passes/);
  });

  it("validates the scope", async () => {
    expect((await cli(["scope"])).exitCode).toBe(2);
    expect((await cli(["scope", "--name", "X", "--criticality", "huge"])).exitCode).toBe(2);
    expect((await cli(["scope", "--name", "X", "--window", "0"])).exitCode).toBe(2);
    const ok = JSON.parse(
      (await cli(["scope", "--name", "X", "--criticality", "high"])).stdout,
    ) as Scope;
    expect(ok.evidenceWindowDays).toBe(90);
  });

  it("lists only the questions a template cannot answer in the evidence template", async () => {
    const t = JSON.parse((await cli(["evidence-template"])).stdout) as {
      answers: Array<{ questionId: string }>;
    };
    expect(t.answers.some((a) => a.questionId === "REL-DLQ")).toBe(false);
    expect(t.answers.some((a) => a.questionId === "REL-IDEMPOTENCY")).toBe(true);
  });

  it("ignores empty template answers and unknown question ids", async () => {
    writeFileSync(
      join(root, "a.json"),
      JSON.stringify({
        answers: [
          { questionId: "NOPE", answer: "yes" },
          { questionId: "OPS-RUNBOOKS", answer: "partly" },
        ],
      }),
    );
    const out = await cli(["review", "--answers", "a.json", "--json"]);
    const review = JSON.parse(out.stdout) as { questions: Array<{ id: string; status: string }> };
    expect(review.questions.find((q) => q.id === "OPS-RUNBOOKS")?.status).toBe("partial");
    writeFileSync(
      join(root, "bad.json"),
      JSON.stringify({ answers: [{ questionId: "OPS-RUNBOOKS", answer: "maybe" }] }),
    );
    expect((await cli(["review", "--answers", "bad.json"])).exitCode).toBe(1);
  });

  it("writes new files only, produces a plan, and compares", async () => {
    const first = await cli(["review", "--write", "--out", "docs/reviews/r1"]);
    expect(first.stdout).toContain("Created docs/reviews/r1.json");
    const again = await cli(["review", "--write", "--out", "docs/reviews/r1"]);
    expect(again.stdout).toContain("already exists");
    const plan = await cli([
      "improve",
      "docs/reviews/r1.json",
      "--write",
      "--out",
      "docs/reviews/plan",
    ]);
    expect(plan.stdout).toContain("# Improvement plan");
    expect(existsSync(join(root, "docs/reviews/plan.md"))).toBe(true);
    const cmp = await cli(["compare", "docs/reviews/r1.json", "docs/reviews/r1.json"]);
    expect(cmp.stdout).toContain("Unchanged:");
  });

  it("refuses files outside the project and documents that are not reviews", async () => {
    expect((await cli(["improve", "/etc/passwd"])).exitCode).toBe(1);
    writeFileSync(join(root, "x.json"), "{}");
    expect((await cli(["improve", "x.json"])).stdout).toMatch(/not a Well-Architected review/);
    expect((await cli(["review", "--report", "x.json"])).exitCode).toBe(1);
  });

  it("rejects unknown commands and options", async () => {
    expect((await cli(["nope"])).exitCode).toBe(2);
    expect((await cli(["review", "--bogus"])).exitCode).toBe(2);
  });
});

import { describe, expect, it } from "vitest";

import { fit, type Line, MAX_FILE_BYTES, panelFor } from "../src/lib/panel.js";

const report = {
  schemaVersion: "1",
  plugin: "aws-security",
  mode: "read-only-cloud",
  summary: "2 findings",
  context: { accountId: "111122223333", identityVerified: true },
  findings: [
    {
      severity: "high",
      title: "Root has no MFA",
      ruleId: "ACC-ROOT-NO-MFA",
      status: "confirmed",
      affectedResources: ["account 111122223333"],
    },
    { severity: "info", title: "Tracing off", ruleId: "X", status: "hypothesis" },
  ],
  limitations: ["Read-only."],
};
const texts = (p: { lines: Line[] }) => p.lines.map((l) => l.text).join("\n");

describe("the report pane model", () => {
  it("shows an analysis report with masked account, severity tones, and hypotheses marked", () => {
    const p = panelFor(JSON.stringify(report));
    expect(p.title).toBe("Report: aws-security");
    expect(texts(p)).toContain("5093".length === 4 ? "1111…3333" : "");
    expect(texts(p)).not.toContain("111122223333 ·");
    expect(p.lines.find((l) => l.text.startsWith("[HIGH]"))?.tone).toBe("red");
    expect(texts(p)).toContain("(hypothesis)");
  });
  it("shows a Well-Architected review with the disclaimer first", () => {
    const p = panelFor(
      JSON.stringify({
        kind: "WellArchitectedReview",
        disclaimer: "Not an official AWS review.",
        scope: { name: "Orders", criticality: "high", environment: "prod" },
        coverage: { questions: 30, withEvidence: 12, verified: 0 },
        byPillar: { security: { evidenced: 1, partial: 2, gap: 3, unknown: 4 } },
        backlog: [
          { priority: "P1", questionId: "SEC-AUTHZ", status: "gap", action: "Add an authorizer" },
        ],
        missing: [1, 2],
      }),
    );
    expect(p.lines[0]?.text).toBe("Not an official AWS review.");
    expect(texts(p)).toMatch(/12 of 30/);
    expect(p.lines.find((l) => l.text.startsWith("P1"))?.tone).toBe("red");
    expect(texts(p)).toMatch(/2 question\(s\) have no evidence: unknown, not met/);
  });
  it("shows the Mermaid source of a diagram artifact", () => {
    const p = panelFor(
      JSON.stringify({
        kind: "DiagramArtifact",
        title: "Orders",
        diagramType: "architecture",
        legend: "Solid arrow: declared.",
        mermaid: "flowchart LR\n  a --> b",
        provenance: ["templates"],
      }),
    );
    expect(texts(p)).toContain("flowchart LR");
    expect(texts(p)).toContain("Source: templates");
  });
  it("says so when the file is unreadable, not JSON, or not a report", () => {
    expect(panelFor(null).lines[0]?.text).toMatch(/could not be read/);
    expect(panelFor("{").lines[0]?.text).toMatch(/not valid JSON/);
    expect(panelFor("{}").lines[0]?.text).toMatch(/not a report this panel understands/);
    expect(MAX_FILE_BYTES).toBe(1_000_000);
  });
  it("removes terminal escape sequences from file content", () => {
    const p = panelFor(JSON.stringify({ ...report, summary: "\u001b[31mred\u001b[0m" }));
    expect(texts(p)).not.toContain("\u001b");
  });
  it("fits to the pane and says what was cut", () => {
    const lines: Line[] = Array.from({ length: 50 }, (_, i) => ({
      text: `line ${i} ${"x".repeat(200)}`,
      tone: "plain" as const,
    }));
    const out = fit(lines, 40, 10);
    expect(out).toHaveLength(8);
    expect(out[0]?.text.length).toBe(40);
    expect(out[7]?.text).toMatch(/more line/);
    expect(fit(lines.slice(0, 2), 80, 24)).toHaveLength(2);
  });
});

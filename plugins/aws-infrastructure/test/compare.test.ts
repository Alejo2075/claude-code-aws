import { LOCAL_CONTEXT } from "@claude-code-aws/report-contract";
import { describe, expect, it } from "vitest";

import { compareStacks, diffFindings, diffReport } from "../src/lib/compare.js";
import { template } from "./helpers.js";

const compare = (before: string, after: string) => {
  const { diff } = compareStacks({
    baseline: [{ name: "S", file: "a", template: template(before) }],
    candidate: [{ name: "S", file: "b", template: template(after) }],
    baselineLabel: before,
    candidateLabel: after,
    context: LOCAL_CONTEXT,
    now: new Date("2026-10-31T00:00:00Z"),
  });
  return { diff, findings: diffFindings(diff.changes) };
};

describe("compareStacks and diffFindings", () => {
  it("finds no difference between identical templates", () => {
    const { diff, findings } = compare("orders.v1", "orders.v1");
    expect(diff.changes).toEqual([]);
    expect(findings).toEqual([]);
    expect(diff.method).toBe("template");
    expect(diff.limitations.join(" ")).toContain("change set");
  });

  it("reports a renamed stateful table as a high-risk delete plus create", () => {
    const { diff, findings } = compare("orders.v1", "orders.v2-renamed-table");
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain("INFRA-DIFF-POSSIBLE-RENAME");
    expect(ids).toContain("INFRA-DIFF-STATEFUL-DELETE");
    const rename = findings.find((finding) => finding.ruleId === "INFRA-DIFF-POSSIBLE-RENAME");
    expect(rename).toMatchObject({ severity: "high", status: "confirmed", source: "static" });
    // The old table has a Retain policy, so deleting it from the template keeps the physical table.
    expect(
      findings.find((finding) => finding.ruleId === "INFRA-DIFF-STATEFUL-DELETE")?.severity,
    ).toBe("low");
    expect(diff.summary.delete).toBeGreaterThan(0);
  });

  it("reports a key change on a stateful table as a possible replacement and says a change set confirms", () => {
    const { findings } = compare("orders.v1", "orders.v3-new-key");
    const finding = findings.find(
      (candidate) => candidate.ruleId === "INFRA-DIFF-STATEFUL-REPLACE",
    );
    expect(finding).toMatchObject({ severity: "medium" });
    expect(finding?.title).toContain("might be replaced");
    expect(finding?.explanation).toContain("change set");
  });

  it("compares stacks by name and notes added and removed stacks", () => {
    const { diff } = compareStacks({
      baseline: [
        { name: "Old", file: "a", template: template("orders.v1") },
        { name: "Both", file: "b", template: template("orders.v1") },
      ],
      candidate: [
        { name: "New", file: "c", template: template("orders.v1") },
        { name: "Both", file: "d", template: template("orders.v3-new-key") },
      ],
      baselineLabel: "a",
      candidateLabel: "b",
      context: LOCAL_CONTEXT,
    });
    expect(diff.limitations.join(" ")).toContain("Stack New is new");
    expect(diff.limitations.join(" ")).toContain("Stack Old is not in the candidate");
    expect(diff.changes.every((change) => change.logicalId.startsWith("Both/"))).toBe(true);
  });

  it("builds a report whose summary counts the high-risk findings and validates", () => {
    const { diff, findings } = compare("orders.v1", "orders.v2-renamed-table");
    const report = diffReport(diff, findings);
    expect(report.plugin).toBe("aws-infrastructure");
    expect(report.summary).toContain("high-risk");
    expect(report.mode).toBe("local");
  });
});

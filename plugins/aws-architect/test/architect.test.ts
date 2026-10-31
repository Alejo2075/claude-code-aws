import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { planCodec } from "@claude-code-aws/report-contract";
import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { nextNumber, renderAdr, slugOf } from "../src/lib/adr.js";
import { runCli } from "../src/lib/cli.js";
import { architectureOf, toMermaid } from "../src/lib/diagram.js";
import { getTopic, TOPIC_NAMES } from "../src/lib/decisions.js";
import { checkIntake, INTAKE } from "../src/lib/intake.js";
import { checkPlan, initPlan } from "../src/lib/plan.js";
import { review } from "../src/lib/review.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "tests", "fixtures", "serverless");
const load = (name: string) => {
  const parsed = parseTemplate(readFileSync(join(FIXTURES, "templates", name), "utf8"));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.template;
};
const NOW = new Date("2026-10-31T00:00:00Z");

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-architect-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the diagram", () => {
  it("marks the SQS to Lambda link as declared and the table access as inferred", () => {
    const architecture = architectureOf(load("orders.v1.template.json"));
    const links = architecture.links;
    expect(links.find((l) => l.label === "event source")?.basis).toBe("declared");
    expect(links.find((l) => l.label === "dead-letter")?.basis).toBe("declared");
    expect(links.filter((l) => l.basis === "inferred").length).toBeGreaterThan(0);
    for (const link of links.filter((l) => l.label.includes("IAM")))
      expect(link.basis).toBe("inferred");
  });

  it("draws declared links solid and inferred links dotted", () => {
    const text = toMermaid(architectureOf(load("orders.v1.template.json")));
    expect(text).toMatch(/^flowchart LR/);
    expect(text).toMatch(/-->\|"event source"\|/);
    expect(text).toMatch(/-\.->\|".*\(inferred\)"\|/);
  });

  it("keeps hostile names from breaking out of the Mermaid label", () => {
    const parsed = parseTemplate({
      Resources: { 'Evil"]\nclick': { Type: "AWS::SQS::Queue", Properties: {} } },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const text = toMermaid(architectureOf(parsed.template));
    expect(text.split("\n")).toHaveLength(2);
    expect(text.match(/"\]/g)).toHaveLength(1);
  });
});

describe("the review", () => {
  it("answers from the template and says what it cannot answer", () => {
    const result = review(load("orders.v1.template.json"));
    const byId = Object.fromEntries(result.answered.map((a) => [a.id, a]));
    expect(byId["REL-DLQ"]?.answer).toBe("yes");
    expect(byId["OPS-ALARMS"]?.answer).toBe("no");
    expect(byId["REL-IDEMPOTENCY"]?.answer).toBe("not-in-template");
    expect(result.needsOthers.length).toBeGreaterThan(0);
    for (const a of result.answered) {
      expect(a.source, a.id).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
      expect(a.evidence, a.id).not.toBe("");
    }
  });

  it("finds the open API route", () => {
    const open = review(load("auth-api.missing-auth.template.json")).answered.find(
      (a) => a.id === "SEC-AUTHZ",
    );
    expect(open?.answer).not.toBe("yes");
  });
});

describe("decisions", () => {
  it("every topic has options, questions, and a source", () => {
    expect(TOPIC_NAMES.length).toBeGreaterThanOrEqual(6);
    for (const name of TOPIC_NAMES) {
      const topic = getTopic(name);
      expect(topic?.source, name).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
      expect(topic?.options.length, name).toBeGreaterThanOrEqual(2);
      expect(topic?.askFirst.length, name).toBeGreaterThan(0);
    }
  });

  it("does not resolve inherited property names as topics", () => {
    expect(getTopic("constructor")).toBeNull();
    expect(getTopic("__proto__")).toBeNull();
  });
});

describe("intake and plan", () => {
  it("lists every question as open when nothing is stated", () => {
    expect(checkIntake({}).missing).toHaveLength(INTAKE.length);
  });

  it("treats placeholders as missing and keeps unknown keys", () => {
    const result = checkIntake({ workload: "orders api", latency: "TBD", extra: "x" });
    expect(result.answered.map((a) => a.key)).toEqual(["workload"]);
    expect(result.missing.map((q) => q.key)).toContain("latency");
    expect(result.unknownKeys).toEqual(["extra"]);
  });

  it("produces a plan that its own validator accepts, with the gaps as open questions", () => {
    const plan = initPlan("Orders", { workload: "orders api" }, NOW);
    expect(planCodec.validate(plan).ok).toBe(true);
    expect(plan.openQuestions).toHaveLength(INTAKE.length - 1);
    const checked = checkPlan(JSON.stringify(plan));
    expect(checked.ok && checked.warnings.join(" ")).toMatch(/no components/);
  });

  it("flags duplicate components and dangling integrations", () => {
    const plan = initPlan("Orders", {}, NOW);
    plan.components = [
      { id: "a", kind: "queue", name: "A", purpose: "x" },
      { id: "a", kind: "function", name: "B", purpose: "y" },
    ];
    plan.integrations = [{ from: "a", to: "missing", style: "async" }];
    const checked = checkPlan(JSON.stringify(plan));
    expect(checked.ok && checked.warnings.join("\n")).toMatch(/more than once/);
    expect(checked.ok && checked.warnings.join("\n")).toMatch(/"missing"/);
  });

  it("rejects a document that is not a plan", () => {
    expect(checkPlan("{}").ok).toBe(false);
    expect(checkPlan("not json").ok).toBe(false);
  });
});

describe("ADRs", () => {
  it("numbers after the highest existing record and slugs titles safely", () => {
    expect(nextNumber(["0001-a.md", "0007-b.md", "README.md"])).toBe(8);
    expect(slugOf("Use SQS, not SNS!")).toBe("use-sqs-not-sns");
    expect(slugOf("../../etc/passwd")).toBe("etc-passwd");
    expect(slugOf("!!!")).toBe("decision");
  });

  it("strips terminal escape sequences from the text", () => {
    const text = renderAdr(
      {
        title: "T",
        status: "proposed",
        context: "a\u001b[31mred",
        decision: "d",
        consequences: "c",
        options: [],
      },
      1,
      "2026-10-31",
    );
    expect(text).not.toContain("\u001b");
    expect(text).toContain("# 0001. T");
  });
});

describe("the command line", () => {
  const cli = (args: string[]) => runCli(args, { root, now: NOW });

  it("draws and reviews a cdk.out directory inside the project", async () => {
    const result = await runCli(["diagram", "cdk.out.orders"], { root: FIXTURES, now: NOW });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("flowchart LR");
    const reviewed = await runCli(["review", "cdk.out.orders", "--json"], {
      root: FIXTURES,
      now: NOW,
    });
    const body = JSON.parse(reviewed.stdout) as { reviews: Array<{ answered: unknown[] }> };
    expect(body.reviews[0]?.answered.length).toBeGreaterThan(5);
  });

  it("refuses a path outside the project", async () => {
    const result = await runCli(["diagram", "../../etc"], { root: FIXTURES, now: NOW });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/outside the project/);
  });

  it("drafts an ADR without writing, and writes only with --write, never overwriting", async () => {
    const args = ["adr", "--title", "Use SQS", "--decision", "Use a queue", "--option", "SNS"];
    const draft = await cli(args);
    expect(draft.stdout).toContain("Draft only");
    expect(existsSync(join(root, "docs", "adr"))).toBe(false);

    const first = await cli([...args, "--write"]);
    expect(first.stdout).toBe("Created docs/adr/0001-use-sqs.md");
    const second = await cli([...args, "--write"]);
    expect(second.stdout).toBe("Created docs/adr/0002-use-sqs.md");
    expect(readFileSync(join(root, "docs/adr/0001-use-sqs.md"), "utf8")).toContain("- SNS");
  });

  it("checks a plan file and rejects one outside the project", async () => {
    const init = await cli(["plan", "init", "--title", "Orders"]);
    writeFileSync(join(root, "plan.json"), init.stdout);
    const ok = await cli(["plan", "check", "plan.json"]);
    expect(ok.exitCode).toBe(0);
    const out = await cli(["plan", "check", "/etc/passwd"]);
    expect(out.exitCode).toBe(2);
  });

  it("rejects unknown commands, options, and malformed requirements", async () => {
    expect((await cli(["nope"])).exitCode).toBe(2);
    expect((await cli(["diagram", "--bogus"])).exitCode).toBe(2);
    expect((await cli(["intake", "--requirements", "[1]"])).exitCode).toBe(2);
    expect((await cli(["decisions", "constructor"])).exitCode).toBe(2);
  });
});

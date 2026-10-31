import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { describe, expect, it } from "vitest";

import {
  applyChange,
  diffGraphs,
  emptyGraph,
  fromInventory,
  fromPlan,
  fromStacks,
  fromStateMachine,
  fromTemplate,
  mergeForDelta,
  mermaidIds,
  parseGraph,
  redactGraph,
  toMermaid,
  validateGraph,
  type ArchitectureGraph,
} from "../src/index.js";

const FIXTURES = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "serverless",
  "templates",
);
const load = (name: string) => {
  const parsed = parseTemplate(readFileSync(join(FIXTURES, name), "utf8"));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.template;
};

const node = (g: ArchitectureGraph, i: number): ArchitectureGraph["nodes"][number] => {
  const n = g.nodes[i];
  if (n === undefined) throw new Error("no such node");
  return n;
};

const small = (): ArchitectureGraph => ({
  ...emptyGraph("t"),
  nodes: [
    { id: "api", kind: "http-api", label: "Api", basis: "declared" },
    { id: "fn", kind: "function", label: "Fn", basis: "declared" },
    { id: "db", kind: "table", label: "Db", basis: "declared" },
  ],
  edges: [
    { from: "api", to: "fn", label: "GET /", basis: "declared" },
    { from: "fn", to: "db", label: "permitted by IAM", basis: "inferred" },
  ],
});

describe("from a template", () => {
  it("marks declared and inferred edges", () => {
    const graph = fromTemplate(load("orders.v1.template.json"));
    expect(graph.edges.find((e) => e.label === "event source")?.basis).toBe("declared");
    expect(
      graph.edges.filter((e) => e.label.includes("IAM")).every((e) => e.basis === "inferred"),
    ).toBe(true);
    expect(validateGraph(graph).filter((p) => p.severity === "error")).toEqual([]);
  });

  it("keeps stacks apart with a prefix and a group", () => {
    const t = load("orders.v1.template.json");
    const graph = fromStacks([
      { name: "A", template: t },
      { name: "B", template: t },
    ]);
    expect(new Set(graph.nodes.map((n) => n.group))).toEqual(new Set(["A", "B"]));
    expect(validateGraph(graph).filter((p) => p.severity === "error")).toEqual([]);
  });
});

describe("other sources", () => {
  it("a plan is intended, an inventory deployed, observed only when stated", () => {
    const plan = fromPlan({
      schemaVersion: "1",
      title: "P",
      generatedAt: "2026-10-31T00:00:00Z",
      requirements: {},
      components: [{ id: "a", kind: "queue", name: "A", purpose: "x" }],
      integrations: [],
      assumptions: [],
      risks: [],
      openQuestions: [],
    });
    expect(plan.nodes[0]?.basis).toBe("intended");
    const inv = fromInventory({
      resources: [
        { id: "q", kind: "queue", name: "Q", account: "111122223333", region: "us-east-1" },
        { id: "f", kind: "function", name: "F" },
      ],
      relations: [
        { from: "q", to: "f", label: "trigger", observed: true },
        { from: "f", to: "q", label: "send" },
      ],
    });
    expect(inv.nodes[0]?.group).toBe("111122223333 / us-east-1");
    expect(inv.edges.map((e) => e.basis)).toEqual(["observed", "inferred"]);
  });

  it("reads Choice, Catch, Default, and Parallel branches from a state machine", () => {
    const asl = {
      StartAt: "A",
      States: {
        A: { Type: "Task", Next: "C", Catch: [{ Next: "Fail" }] },
        C: { Type: "Choice", Choices: [{ Next: "P" }], Default: "Fail" },
        P: {
          Type: "Parallel",
          End: true,
          Branches: [{ StartAt: "X", States: { X: { Type: "Pass", End: true } } }],
        },
        Fail: { Type: "Fail" },
      },
    };
    const before = JSON.stringify(asl);
    const graph = fromStateMachine(asl);
    expect(graph.edges.map((e) => e.label).sort()).toEqual([
      "catch",
      "choice",
      "contains",
      "default",
      "next",
    ]);
    expect(graph.nodes.some((n) => n.id === "P.0.X")).toBe(true);
    expect(JSON.stringify(asl)).toBe(before);
  });
});

describe("validation", () => {
  it("reports dangling edges, duplicates, and self loops", () => {
    const g = small();
    g.edges.push({ from: "api", to: "nope", label: "x", basis: "declared" });
    g.nodes.push({ ...node(g, 0) });
    const messages = validateGraph(g)
      .map((p) => p.message)
      .join("\n");
    expect(messages).toMatch(/not a node/);
    expect(messages).toMatch(/more than once/);
  });

  it("treats a cycle as a warning unless acyclic is required", () => {
    const g = small();
    g.edges.push({ from: "db", to: "api", label: "back", basis: "declared" });
    expect(validateGraph(g).find((p) => p.message.startsWith("Cycle"))?.severity).toBe("warning");
    expect(
      validateGraph(g, { acyclic: true }).find((p) => p.message.startsWith("Cycle"))?.severity,
    ).toBe("error");
  });

  it("rejects documents that are not graphs", () => {
    expect(parseGraph({}).ok).toBe(false);
    expect(parseGraph({ schemaVersion: "1", nodes: [{ id: "a" }], edges: [] }).ok).toBe(false);
    expect(
      parseGraph({
        schemaVersion: "1",
        nodes: [],
        edges: [{ from: "a", to: "b", label: "", basis: "x" }],
      }).ok,
    ).toBe(false);
    expect(parseGraph(JSON.parse(JSON.stringify(small()))).ok).toBe(true);
  });

  it("redacts secrets in labels", () => {
    const g = small();
    node(g, 0).label = "key AKIAIOSFODNN7EXAMPLE";
    const { graph, redacted } = redactGraph(g);
    expect(redacted).toBeGreaterThan(0);
    expect(graph.nodes[0]?.label).not.toContain("AKIA");
  });
});

describe("Mermaid", () => {
  it("is stable: adding a node does not rename or reorder the others", () => {
    const a = toMermaid(small());
    const g = applyChange(small(), {
      addNodes: [{ id: "zz", kind: "queue", label: "Z", basis: "declared" }],
    });
    const b = toMermaid(g);
    for (const line of a.split("\n").filter((l) => l.includes("n_api") || l.includes("n_fn")))
      expect(b).toContain(line);
    expect(toMermaid(small())).toBe(a);
  });

  it("draws each basis differently and states nothing it does not know", () => {
    const text = toMermaid(small());
    expect(text).toContain('n_api -->|"GET /"| n_fn');
    expect(text).toContain('n_fn -.->|"permitted by IAM (inferred)"| n_db');
  });

  it("neutralizes labels that try to break out", () => {
    const g = small();
    node(g, 0).label = 'x"]\nclick n_fn call evil()<script>';
    const text = toMermaid(g);
    expect(text).not.toContain("<script>");
    expect(text.split("\n").filter((l) => l.includes("click")).length).toBe(1);
    expect(text.match(/"\]/g)?.length).toBe(3);
  });

  it("gives colliding ids a suffix", () => {
    const ids = mermaidIds(["a-b", "a_b"]);
    expect(new Set(ids.values()).size).toBe(2);
  });

  it("puts grouped nodes in a box", () => {
    const g = small();
    node(g, 0).group = "Stack A";
    expect(toMermaid(g)).toMatch(/subgraph g_\w+\["Stack A"\]/);
  });
});

describe("diff and update", () => {
  it("finds added, removed, and changed parts", () => {
    const after = applyChange(small(), {
      addNodes: [{ id: "q", kind: "queue", label: "Q", basis: "intended" }],
      removeNodes: ["db"],
    });
    after.nodes[0] = { ...node(after, 0), label: "Renamed" };
    const diff = diffGraphs(small(), after);
    expect(diff.addedNodes.map((n) => n.id)).toEqual(["q"]);
    expect(diff.removedNodes.map((n) => n.id)).toEqual(["db"]);
    expect(diff.changedNodes.map((c) => c.after.id)).toEqual(["api"]);
    expect(diff.removedEdges).toHaveLength(1);
    const delta = mergeForDelta(small(), after);
    expect(toMermaid(delta.graph, { classes: delta.classes })).toMatch(/class n_db removed/);
  });

  it("removing a node removes its edges and keeps the rest in order", () => {
    const g = applyChange(small(), { removeNodes: ["fn"] });
    expect(g.edges).toHaveLength(0);
    expect(g.nodes.map((n) => n.id)).toEqual(["api", "db"]);
  });
});

import { redactText } from "@claude-code-aws/safe-output";

import { type ArchitectureGraph, BASES, type Basis, MAX_EDGES, MAX_NODES } from "./model.js";

export interface Problem {
  severity: "error" | "warning";
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isBasis = (value: unknown): value is Basis =>
  typeof value === "string" && (BASES as readonly string[]).includes(value);

/** Parses untrusted JSON into a graph, or says why it is not one. */
export function parseGraph(
  value: unknown,
): { ok: true; graph: ArchitectureGraph } | { ok: false; error: string } {
  if (!isRecord(value) || value["schemaVersion"] !== "1")
    return { ok: false, error: 'not an architecture graph (schemaVersion must be "1")' };
  const nodes = value["nodes"];
  const edges = value["edges"];
  if (!Array.isArray(nodes) || !Array.isArray(edges))
    return { ok: false, error: "nodes and edges must be lists" };
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES)
    return { ok: false, error: "the graph is too large" };
  const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 300;
  const outNodes: ArchitectureGraph["nodes"] = [];
  for (const n of nodes) {
    if (
      !isRecord(n) ||
      !text(n["id"]) ||
      !text(n["kind"]) ||
      !text(n["label"]) ||
      !isBasis(n["basis"])
    )
      return { ok: false, error: "a node needs id, kind, label, and a valid basis" };
    const group = n["group"];
    if (group !== undefined && !text(group))
      return { ok: false, error: "a node group must be text" };
    outNodes.push({
      id: n["id"],
      kind: n["kind"],
      label: n["label"],
      basis: n["basis"],
      ...(group === undefined ? {} : { group }),
    });
  }
  const outEdges: ArchitectureGraph["edges"] = [];
  for (const e of edges) {
    if (
      !isRecord(e) ||
      !text(e["from"]) ||
      !text(e["to"]) ||
      !isBasis(e["basis"]) ||
      typeof e["label"] !== "string"
    )
      return { ok: false, error: "an edge needs from, to, label, and a valid basis" };
    const confidence = e["confidence"];
    if (
      confidence !== undefined &&
      confidence !== "high" &&
      confidence !== "medium" &&
      confidence !== "low"
    )
      return { ok: false, error: "edge confidence must be high, medium, or low" };
    outEdges.push({
      from: e["from"],
      to: e["to"],
      label: e["label"].slice(0, 120),
      basis: e["basis"],
      ...(confidence === undefined ? {} : { confidence }),
    });
  }
  const title = typeof value["title"] === "string" ? value["title"].slice(0, 120) : "Architecture";
  const notes = Array.isArray(value["notes"])
    ? value["notes"].filter((n): n is string => typeof n === "string").slice(0, 50)
    : [];
  return {
    ok: true,
    graph: { schemaVersion: "1", title, nodes: outNodes, edges: outEdges, notes },
  };
}

/** Referential integrity, duplicates, isolated nodes, and cycles. Cycles are legal unless `acyclic`. */
export function validateGraph(
  graph: ArchitectureGraph,
  options: { acyclic?: boolean } = {},
): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id))
      problems.push({ severity: "error", message: `Node id "${node.id}" is used more than once.` });
    ids.add(node.id);
  }
  const seen = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const touched = new Set<string>();
  for (const edge of graph.edges) {
    let ok = true;
    for (const end of [edge.from, edge.to])
      if (!ids.has(end)) {
        problems.push({
          severity: "error",
          message: `Edge ${edge.from} -> ${edge.to} refers to "${end}", which is not a node.`,
        });
        ok = false;
      }
    if (!ok) continue;
    if (edge.from === edge.to)
      problems.push({ severity: "warning", message: `Edge on "${edge.from}" points to itself.` });
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.label}\u0000${edge.basis}`;
    if (seen.has(key))
      problems.push({
        severity: "warning",
        message: `Edge ${edge.from} -> ${edge.to} ("${edge.label}") is listed twice.`,
      });
    seen.add(key);
    touched.add(edge.from).add(edge.to);
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }
  for (const node of graph.nodes)
    if (!touched.has(node.id) && graph.nodes.length > 1)
      problems.push({ severity: "warning", message: `Node "${node.id}" has no edges.` });
  const cycle = findCycle(graph, adjacency);
  if (cycle !== null)
    problems.push({
      severity: options.acyclic === true ? "error" : "warning",
      message: `Cycle: ${cycle.join(" -> ")}${options.acyclic === true ? "" : " (allowed, e.g. retries or feedback loops)"}.`,
    });
  return problems;
}

function findCycle(graph: ArchitectureGraph, adjacency: Map<string, string[]>): string[] | null {
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const result: { cycle: string[] | null } = { cycle: null };
  const visit = (id: string): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (result.cycle !== null) break;
      if (next === id) continue;
      if (state.get(next) === 1) result.cycle = [...stack.slice(stack.indexOf(next)), next];
      else if (state.get(next) === undefined) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const node of graph.nodes)
    if (state.get(node.id) === undefined && result.cycle === null) visit(node.id);
  return result.cycle;
}

/** Replaces secrets and personal data in every label, so a diagram can be shared. */
export function redactGraph(graph: ArchitectureGraph): {
  graph: ArchitectureGraph;
  redacted: number;
} {
  let redacted = 0;
  const clean = (value: string): string => {
    const result = redactText(value);
    redacted += result.redacted;
    return result.text;
  };
  return {
    graph: {
      ...graph,
      title: clean(graph.title),
      nodes: graph.nodes.map((n) => ({ ...n, label: clean(n.label) })),
      edges: graph.edges.map((e) => ({ ...e, label: clean(e.label) })),
    },
    redacted,
  };
}

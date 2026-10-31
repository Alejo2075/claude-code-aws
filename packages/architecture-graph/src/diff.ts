import type { ArchitectureGraph, GraphEdge, GraphNode } from "./model.js";

export interface GraphDiff {
  addedNodes: GraphNode[];
  removedNodes: GraphNode[];
  changedNodes: Array<{ before: GraphNode; after: GraphNode }>;
  addedEdges: GraphEdge[];
  removedEdges: GraphEdge[];
}

const edgeKey = (e: GraphEdge): string => `${e.from}\u0000${e.to}\u0000${e.label}`;

export function diffGraphs(before: ArchitectureGraph, after: ArchitectureGraph): GraphDiff {
  const b = new Map(before.nodes.map((n) => [n.id, n]));
  const a = new Map(after.nodes.map((n) => [n.id, n]));
  const be = new Map(before.edges.map((e) => [edgeKey(e), e]));
  const ae = new Map(after.edges.map((e) => [edgeKey(e), e]));
  return {
    addedNodes: after.nodes.filter((n) => !b.has(n.id)),
    removedNodes: before.nodes.filter((n) => !a.has(n.id)),
    changedNodes: after.nodes.flatMap((n) => {
      const old = b.get(n.id);
      return old !== undefined &&
        (old.kind !== n.kind ||
          old.label !== n.label ||
          old.basis !== n.basis ||
          old.group !== n.group)
        ? [{ before: old, after: n }]
        : [];
    }),
    addedEdges: after.edges.filter((e) => !be.has(edgeKey(e))),
    removedEdges: before.edges.filter((e) => !ae.has(edgeKey(e))),
  };
}

/** One graph holding both sides of a diff, with the classes that color it. */
export function mergeForDelta(
  before: ArchitectureGraph,
  after: ArchitectureGraph,
): { graph: ArchitectureGraph; classes: Map<string, "added" | "removed" | "changed"> } {
  const diff = diffGraphs(before, after);
  const classes = new Map<string, "added" | "removed" | "changed">();
  for (const n of diff.addedNodes) classes.set(n.id, "added");
  for (const n of diff.removedNodes) classes.set(n.id, "removed");
  for (const c of diff.changedNodes) classes.set(c.after.id, "changed");
  const nodes = [...after.nodes, ...diff.removedNodes];
  const edges = [
    ...after.edges,
    ...diff.removedEdges.map((e) => ({ ...e, label: `${e.label} (removed)` })),
  ];
  return {
    graph: { ...after, title: `${after.title} (change)`, nodes, edges },
    classes,
  };
}

export interface Change {
  addNodes?: GraphNode[];
  removeNodes?: string[];
  addEdges?: GraphEdge[];
  removeEdges?: Array<{ from: string; to: string; label?: string }>;
}

/** Applies a structured change and keeps everything else, in its original order. Removing a node removes its edges. */
export function applyChange(graph: ArchitectureGraph, change: Change): ArchitectureGraph {
  const removed = new Set(change.removeNodes ?? []);
  const nodes = [
    ...graph.nodes.filter((n) => !removed.has(n.id)),
    ...(change.addNodes ?? []).filter((n) => !graph.nodes.some((x) => x.id === n.id)),
  ];
  const dropEdge = (e: GraphEdge): boolean =>
    removed.has(e.from) ||
    removed.has(e.to) ||
    (change.removeEdges ?? []).some(
      (r) => r.from === e.from && r.to === e.to && (r.label === undefined || r.label === e.label),
    );
  const edges = [
    ...graph.edges.filter((e) => !dropEdge(e)),
    ...(change.addEdges ?? []).filter((e) => !graph.edges.some((x) => edgeKey(x) === edgeKey(e))),
  ];
  return { ...graph, nodes, edges };
}

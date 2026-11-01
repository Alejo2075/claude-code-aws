import { type ArchitectureGraph, LEGEND, toMermaid } from "@claude-code-aws/architecture-graph";

export type DiagramType =
  | "architecture"
  | "dependency"
  | "data-flow"
  | "trust-boundaries"
  | "event-flow"
  | "state-graph"
  | "deployment";

export const DIAGRAM_TYPES: readonly DiagramType[] = [
  "architecture",
  "dependency",
  "data-flow",
  "trust-boundaries",
  "event-flow",
  "state-graph",
  "deployment",
];

const EVENT_KINDS = new Set([
  "queue",
  "topic",
  "rule",
  "bus",
  "stream",
  "delivery-stream",
  "function",
  "state-machine",
  "bucket",
]);

/** Which part of the graph each diagram type shows. Types differ in selection and layout, never in facts. */
export function selectFor(graph: ArchitectureGraph, type: DiagramType): ArchitectureGraph {
  if (type === "event-flow") {
    const nodes = graph.nodes.filter((n) => EVENT_KINDS.has(n.kind));
    const ids = new Set(nodes.map((n) => n.id));
    return {
      ...graph,
      nodes,
      edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.basis !== "inferred"),
    };
  }
  if (type === "data-flow") {
    return {
      ...graph,
      edges: graph.edges.filter((e) => e.basis !== "inferred" || /IAM|environment/.test(e.label)),
    };
  }
  return graph;
}

export interface DiagramArtifact {
  schemaVersion: "1";
  kind: "DiagramArtifact";
  diagramType: DiagramType;
  title: string;
  generatedAt: string;
  mermaid: string;
  legend: string;
  graph: ArchitectureGraph;
  provenance: string[];
}

export function buildArtifact(
  graph: ArchitectureGraph,
  type: DiagramType,
  now: Date,
  provenance: string[],
): DiagramArtifact {
  const shown = selectFor(graph, type);
  const direction = type === "dependency" || type === "deployment" ? "TB" : "LR";
  return {
    schemaVersion: "1",
    kind: "DiagramArtifact",
    diagramType: type,
    title: graph.title,
    generatedAt: now.toISOString(),
    mermaid: toMermaid(shown, { direction, groups: type !== "data-flow" }),
    legend: LEGEND,
    graph: shown,
    provenance,
  };
}

export function renderArtifact(a: DiagramArtifact): string {
  return [
    `${a.title} (${a.diagramType})`,
    "",
    "```mermaid",
    a.mermaid,
    "```",
    "",
    a.legend,
    ...a.provenance.map((p) => `Source: ${p}`),
    ...a.graph.notes.map((n) => `Note: ${n}`),
  ].join("\n");
}

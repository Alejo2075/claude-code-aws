// Deprecated: diagram generation is owned by `aws-diagrams`. This keeps `/aws-architect:diagram`
// working with the same shared engine (packages/architecture-graph) until the next major version.
import {
  type ArchitectureGraph,
  fromTemplate,
  type GraphEdge,
  toMermaid as graphToMermaid,
} from "@claude-code-aws/architecture-graph";
import type { Template } from "@claude-code-aws/template-analysis";

export type LinkBasis = "declared" | "inferred";
export type Link = GraphEdge;

export interface Architecture {
  graph: ArchitectureGraph;
  nodes: ArchitectureGraph["nodes"];
  links: GraphEdge[];
}

export const DIAGRAM_DEPRECATION =
  "Deprecated: diagrams moved to the aws-diagrams plugin (/aws-diagrams:from-cdk). This command keeps working for now.";

/** Derives the architecture from a template. Resources that are not part of the picture are left out. */
export function architectureOf(template: Template): Architecture {
  const graph = fromTemplate(template);
  return { graph, nodes: graph.nodes, links: graph.edges };
}

/** Mermaid flowchart: solid arrows are declared in the template, dotted ones are inferred. */
export function toMermaid(architecture: Architecture): string {
  return graphToMermaid(architecture.graph);
}

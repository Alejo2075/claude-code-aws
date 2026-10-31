// The architecture graph. `basis` says how we know a node or an edge exists, because a diagram that
// mixes a design, a template, a deployment, and an observation without saying so is misleading:
//   intended  - from a design or plan, nothing exists yet
//   declared  - written in code or a synthesized template
//   deployed  - listed by the account (inventory)
//   observed  - seen in telemetry (trace, log, metric)
//   inferred  - derived from permissions or configuration: it can happen, not shown to happen
export const BASES = ["intended", "declared", "deployed", "observed", "inferred"] as const;
export type Basis = (typeof BASES)[number];

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  basis: Basis;
  /** A grouping such as a stack, an account and region, or a trust boundary. */
  group?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  basis: Basis;
  confidence?: "high" | "medium" | "low";
}

export interface ArchitectureGraph {
  schemaVersion: "1";
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  notes: string[];
}

export const emptyGraph = (title: string): ArchitectureGraph => ({
  schemaVersion: "1",
  title,
  nodes: [],
  edges: [],
  notes: [],
});

export const MAX_NODES = 500;
export const MAX_EDGES = 2000;

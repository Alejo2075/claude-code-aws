import { buildGraph, findCycles } from "./graph.js";
import { isStateful, statefulReason } from "./catalog.js";
import type { Edge, Template } from "./types.js";

export interface FunctionSummary {
  logicalId: string;
  runtime: string | null;
  timeout: number | null;
  memory: number | null;
  tracing: string | null;
  hasDeadLetterConfig: boolean;
}

export interface Inventory {
  resourceCount: number;
  byType: Array<{ type: string; count: number }>;
  stateful: Array<{
    logicalId: string;
    type: string;
    reason: string;
    deletionPolicy: string | null;
  }>;
  functions: FunctionSummary[];
  edges: Edge[];
  cycles: string[][];
  outputs: string[];
}

const num = (value: unknown): number | null => (typeof value === "number" ? value : null);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** A deterministic overview of a template. */
export function inventory(template: Template): Inventory {
  const counts = new Map<string, number>();
  for (const resource of Object.values(template.resources)) {
    counts.set(resource.type, (counts.get(resource.type) ?? 0) + 1);
  }
  const edges = buildGraph(template);
  return {
    resourceCount: Object.keys(template.resources).length,
    byType: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    stateful: Object.values(template.resources)
      .filter((resource) => isStateful(resource.type))
      .map((resource) => ({
        logicalId: resource.logicalId,
        type: resource.type,
        reason: statefulReason(resource.type) ?? "",
        deletionPolicy: resource.deletionPolicy,
      })),
    functions: Object.values(template.resources)
      .filter((resource) => resource.type === "AWS::Lambda::Function")
      .map((resource) => ({
        logicalId: resource.logicalId,
        runtime: text(resource.properties["Runtime"]),
        timeout: num(resource.properties["Timeout"]),
        memory: num(resource.properties["MemorySize"]),
        tracing: text(
          (resource.properties["TracingConfig"] as Record<string, unknown> | undefined)?.["Mode"],
        ),
        hasDeadLetterConfig: resource.properties["DeadLetterConfig"] !== undefined,
      })),
    edges,
    cycles: findCycles(template, edges),
    outputs: Object.keys(template.outputs),
  };
}

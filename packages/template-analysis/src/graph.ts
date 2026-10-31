import type { Edge, Template } from "./types.js";

const PSEUDO = /^AWS::/;
const SUB_VARIABLE = /\$\{([A-Za-z0-9:._-]+)\}/g;

/** Logical ids that a value refers to, with how. Intrinsics are walked to a bounded depth. */
export function referencesIn(
  value: unknown,
  depth = 0,
  found: Array<[string, Edge["via"]]> = [],
): Array<[string, Edge["via"]]> {
  if (depth > 40 || value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) referencesIn(item, depth + 1, found);
    return found;
  }
  const record = value as Record<string, unknown>;
  for (const [key, inner] of Object.entries(record)) {
    if (key === "Ref" && typeof inner === "string" && !PSEUDO.test(inner)) {
      found.push([inner, "ref"]);
    } else if (key === "Fn::GetAtt") {
      const target: unknown = Array.isArray(inner)
        ? (inner as unknown[])[0]
        : typeof inner === "string"
          ? inner.split(".")[0]
          : undefined;
      if (typeof target === "string") found.push([target, "getatt"]);
    } else if (key === "Fn::Sub") {
      const text: unknown = Array.isArray(inner) ? (inner as unknown[])[0] : inner;
      // In the list form, the map defines local variables that are not resources.
      const locals =
        Array.isArray(inner) && typeof inner[1] === "object" && inner[1] !== null
          ? new Set(Object.keys(inner[1] as Record<string, unknown>))
          : new Set<string>();
      if (typeof text === "string") {
        for (const match of text.matchAll(SUB_VARIABLE)) {
          const name = (match[1] ?? "").split(".")[0] ?? "";
          if (name !== "" && !PSEUDO.test(name) && !locals.has(name)) found.push([name, "sub"]);
        }
      }
      if (Array.isArray(inner)) referencesIn(inner[1], depth + 1, found);
    } else {
      referencesIn(inner, depth + 1, found);
    }
  }
  return found;
}

/** The dependency edges between resources. References to parameters or unknown ids are dropped. */
export function buildGraph(template: Template): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, via: Edge["via"]): void => {
    const key = `${from}\u0000${to}\u0000${via}`;
    if (from === to || seen.has(key) || template.resources[to] === undefined) return;
    seen.add(key);
    edges.push({ from, to, via });
  };
  for (const resource of Object.values(template.resources)) {
    for (const [target, via] of referencesIn(resource.properties))
      add(resource.logicalId, target, via);
    for (const [target, via] of referencesIn(resource.metadata))
      add(resource.logicalId, target, via);
    for (const target of resource.dependsOn) add(resource.logicalId, target, "dependson");
  }
  return edges;
}

/** Resources that `from` refers to directly. */
export function dependenciesOf(edges: readonly Edge[], from: string): string[] {
  return [...new Set(edges.filter((edge) => edge.from === from).map((edge) => edge.to))];
}

/** Resources that refer to `to`. */
export function dependentsOf(edges: readonly Edge[], to: string): string[] {
  return [...new Set(edges.filter((edge) => edge.to === to).map((edge) => edge.from))];
}

/** Cycles among resources (CloudFormation rejects them). Each is returned once, as a list of ids. */
export function findCycles(template: Template, edges: readonly Edge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const id of Object.keys(template.resources)) adjacency.set(id, dependenciesOf(edges, id));
  const cycles: string[][] = [];
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (state.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (state.get(next) === undefined) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of adjacency.keys()) if (state.get(id) === undefined) visit(id);
  return cycles;
}

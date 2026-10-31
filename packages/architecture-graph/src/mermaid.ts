import type { ArchitectureGraph, Basis } from "./model.js";

const text = (value: string, max = 60): string =>
  // Quotes, brackets, angle brackets, and line breaks would end the label or inject markup.
  Array.from(value, (ch) => (/["\n\r<>[\]{}|`]/.test(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (const ch of value) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return h.toString(36);
}

function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}

/** Ids that depend only on the node's own id, so adding a node never renames the others. */
export function mermaidIds(ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const id of [...ids].sort()) {
    const slug = trimUnderscores(id.replace(/[^A-Za-z0-9]+/g, "_")).slice(0, 40) || "n";
    let candidate = `n_${slug}`;
    if (used.has(candidate)) candidate = `${candidate}_${hash(id)}`;
    used.add(candidate);
    out.set(id, candidate);
  }
  return out;
}

const NODE_STYLE: Record<Basis, string> = {
  intended: "stroke-dasharray: 5 3",
  declared: "",
  deployed: "stroke-width:2px",
  observed: "stroke-width:3px",
  inferred: "stroke-dasharray: 2 2",
};

export interface MermaidOptions {
  direction?: "LR" | "TB";
  /** Draw groups (stacks, accounts, trust boundaries) as boxes. Default true. */
  groups?: boolean;
  /** Extra class per node id, used by diffs. */
  classes?: Map<string, "added" | "removed" | "changed">;
}

/** Mermaid flowchart. Output is sorted, so the same graph always gives the same text. */
export function toMermaid(graph: ArchitectureGraph, options: MermaidOptions = {}): string {
  const ids = mermaidIds(graph.nodes.map((n) => n.id));
  const lines = [`flowchart ${options.direction ?? "LR"}`];
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const draw = (indent: string, node: (typeof nodes)[number]): void => {
    lines.push(`${indent}${ids.get(node.id)}["${text(node.kind)}: ${text(node.label)}"]`);
  };
  const grouped = options.groups !== false;
  const groups = [
    ...new Set(nodes.flatMap((n) => (n.group === undefined ? [] : [n.group]))),
  ].sort();
  if (grouped)
    for (const group of groups) {
      lines.push(`  subgraph g_${hash(group)}["${text(group)}"]`);
      for (const node of nodes) if (node.group === group) draw("    ", node);
      lines.push("  end");
    }
  for (const node of nodes) if (!grouped || node.group === undefined) draw("  ", node);
  const edges = [...graph.edges].sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.label.localeCompare(b.label),
  );
  for (const edge of edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const label = text(edge.label);
    const tag = edge.basis === "declared" || edge.basis === "deployed" ? "" : ` (${edge.basis})`;
    const caption = `${label}${tag}`.trim();
    const arrow =
      edge.basis === "inferred" || edge.basis === "intended"
        ? "-.->"
        : edge.basis === "observed"
          ? "==>"
          : "-->";
    lines.push(
      caption === "" ? `  ${from} ${arrow} ${to}` : `  ${from} ${arrow}|"${caption}"| ${to}`,
    );
  }
  for (const node of nodes) {
    const style = NODE_STYLE[node.basis];
    if (style !== "") lines.push(`  style ${ids.get(node.id)} ${style}`);
  }
  if (options.classes !== undefined) {
    lines.push(
      "  classDef added fill:#d4f5d4,stroke:#2a7a2a",
      "  classDef removed fill:#f9d6d6,stroke:#a02020",
      "  classDef changed fill:#fdf0c4,stroke:#9a7b00",
    );
    for (const node of nodes) {
      const cls = options.classes.get(node.id);
      if (cls !== undefined) lines.push(`  class ${ids.get(node.id)} ${cls}`);
    }
  }
  return lines.join("\n");
}

/** What the arrow styles mean, for the text next to a diagram. */
export const LEGEND =
  "Solid arrow: declared in code or listed in the account. Dotted: intended by a design, or inferred from permissions or configuration (it can happen; not shown to happen). Thick: observed in telemetry.";

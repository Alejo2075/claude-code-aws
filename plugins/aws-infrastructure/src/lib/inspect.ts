import { inventory, type Inventory } from "@claude-code-aws/template-analysis";

import type { LoadedStack } from "./load.js";

export interface StackInspection {
  name: string;
  file: string;
  inventory: Inventory;
}

export interface InspectResult {
  schemaVersion: "1";
  stacks: StackInspection[];
  problems: string[];
}

export function inspectStacks(
  stacks: readonly LoadedStack[],
  problems: readonly string[],
): InspectResult {
  return {
    schemaVersion: "1",
    stacks: stacks.map((stack) => ({
      name: stack.name,
      file: stack.file,
      inventory: inventory(stack.template),
    })),
    problems: [...problems],
  };
}

export function renderInspect(result: InspectResult): string {
  const lines: string[] = [];
  if (result.stacks.length === 0) lines.push("No stacks were read.");
  for (const stack of result.stacks) {
    const { inventory: inv } = stack;
    lines.push(
      `Stack ${stack.name}: ${inv.resourceCount} resources, ${inv.edges.length} dependencies, ${inv.outputs.length} outputs`,
    );
    lines.push("  Resource types:");
    for (const entry of inv.byType.slice(0, 15))
      lines.push(`    ${String(entry.count).padStart(3)}  ${entry.type}`);
    if (inv.byType.length > 15) lines.push(`    ... and ${inv.byType.length - 15} more types`);
    if (inv.stateful.length > 0) {
      lines.push("  Stateful resources (data is at stake if they are replaced or deleted):");
      for (const item of inv.stateful) {
        lines.push(
          `    ${item.logicalId} (${item.type}) ${item.reason}; DeletionPolicy ${item.deletionPolicy ?? "not set (deleted with the stack)"}`,
        );
      }
    }
    if (inv.functions.length > 0) {
      lines.push("  Lambda functions:");
      for (const fn of inv.functions) {
        lines.push(
          `    ${fn.logicalId}: ${fn.runtime ?? "runtime unresolved"}, timeout ${fn.timeout ?? "default 3"}s, memory ${fn.memory ?? "default 128"} MB, tracing ${fn.tracing ?? "off"}`,
        );
      }
    }
    for (const cycle of inv.cycles) lines.push(`  Dependency cycle: ${cycle.join(" -> ")}`);
    lines.push("");
  }
  for (const problem of result.problems) lines.push(`Problem: ${problem}`);
  lines.push(
    "Read from the synthesized templates only; nothing was run and AWS was not contacted.",
  );
  return lines.join("\n");
}

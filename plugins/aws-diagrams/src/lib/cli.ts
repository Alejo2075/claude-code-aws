import { isAbsolute, resolve } from "node:path";

import {
  type ArchitectureGraph,
  applyChange,
  type Change,
  diffGraphs,
  fromInventory,
  fromPlan,
  fromStacks,
  fromStateMachine,
  type Inventory,
  mergeForDelta,
  parseGraph,
  redactGraph,
  toMermaid,
  validateGraph,
} from "@claude-code-aws/architecture-graph";
import { readTextBounded } from "@claude-code-aws/context-contract/node";
import { planCodec } from "@claude-code-aws/report-contract";
import { loadStacks } from "@claude-code-aws/template-analysis/node";
import { isInside } from "@claude-code-aws/tool-runner";

import { buildArtifact, DIAGRAM_TYPES, type DiagramType, renderArtifact } from "./artifact.js";
import { DEFAULT_DIR, writeNew } from "./files.js";
import { renderImage, type Runner } from "./render.js";

export const USAGE = `Usage: aws-diagrams <command> [options]

  generate --from <file> [--type <t>]       From a graph, an architecture plan, or an inventory file (kind detected)
  from-cdk [path] [--stack name] [--type t] From cdk.out (default) or a template: declared links solid, inferred dotted
  from-asl <file>                           State graph of a Step Functions definition (JSON)
  update <graph> --change <file>            Apply added/removed nodes and edges; other ids and order are kept
  diff <before> <after>                     What changed between two graphs, as text and as a colored diagram
  validate <graph> [--acyclic]              Referential integrity, duplicates, isolated nodes, cycles
  export <graph> --out <name> [--format mmd|svg|png]   Write the source (always) and an image if a renderer exists

Types: ${DIAGRAM_TYPES.join(", ")}
Options: --json   --write (generate/from-cdk/from-asl: save under ${DEFAULT_DIR} as <name>.mmd and .json)   --name <name>

Reads files inside the project. Writes only new files and never overwrites one. No AWS calls.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}
export interface CliDeps {
  root: string;
  env?: Record<string, string | undefined>;
  now?: Date;
  run?: Runner;
}

const FLAGS = ["json", "write", "acyclic"];
const VALUED = ["from", "type", "stack", "change", "out", "format", "name"];
const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});

function readJson(
  root: string,
  path: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const target = isAbsolute(path) ? path : resolve(root, path);
  if (!isInside(root, target)) return { ok: false, error: `${path} is outside the project` };
  const read = readTextBounded(target, 4_000_000);
  if (read.kind !== "ok") return { ok: false, error: `${path} could not be read (${read.kind})` };
  try {
    return { ok: true, value: JSON.parse(read.text) as unknown };
  } catch {
    return { ok: false, error: `${path} is not valid JSON` };
  }
}

function graphFile(
  root: string,
  path: string,
): { ok: true; graph: ArchitectureGraph } | { ok: false; error: string } {
  const json = readJson(root, path);
  if (!json.ok) return json;
  const value = (json.value as { graph?: unknown } | null)?.graph ?? json.value;
  return parseGraph(value);
}

const isInventory = (v: unknown): v is Inventory =>
  typeof v === "object" &&
  v !== null &&
  Array.isArray((v as Inventory).resources) &&
  Array.isArray((v as Inventory).relations);

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  const words: string[] = [];
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (FLAGS.includes(name)) flags.add(name);
    else if (VALUED.includes(name)) {
      const value = argv[i + 1];
      if (value === undefined) return usageError(`--${name} needs a value`);
      options.set(name, value);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = flags.has("json");
  const [command, a, b, extra] = words;
  if (extra !== undefined) return usageError("too many arguments");
  const now = deps.now ?? new Date();
  const typeOption = options.get("type") ?? "architecture";
  if (!(DIAGRAM_TYPES as readonly string[]).includes(typeOption))
    return usageError(`unknown type ${typeOption}`);
  const type = typeOption as DiagramType;
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text,
  });

  const finish = (
    graphIn: ArchitectureGraph,
    provenance: string[],
    problems: string[],
  ): CliResult => {
    const { graph, redacted } = redactGraph(graphIn);
    if (redacted > 0)
      problems.push(`${redacted} secret-like or personal value(s) in labels were redacted.`);
    const bad = validateGraph(graph).filter((p) => p.severity === "error");
    if (bad.length > 0)
      return {
        exitCode: 1,
        stdout: `The graph is not valid:\n${bad.map((p) => `  - ${p.message}`).join("\n")}`,
      };
    const artifact = buildArtifact(graph, type, now, provenance);
    let text = [renderArtifact(artifact), ...problems.map((p) => `Note: ${p}`)].join("\n");
    if (flags.has("write")) {
      const name =
        (options.get("name") ?? graph.title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "diagram";
      const src = writeNew(deps.root, `${DEFAULT_DIR}/${name}.mmd`, `${artifact.mermaid}\n`);
      const data = writeNew(
        deps.root,
        `${DEFAULT_DIR}/${name}.json`,
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
      text += `\n${[src, data].map((r) => (r.ok ? `Created ${r.file}` : `Not written: ${r.error}`)).join("\n")}`;
    }
    return print(artifact, text);
  };

  if (command === "from-cdk") {
    const loaded = loadStacks(deps.root, a ?? "cdk.out");
    if (loaded.stacks.length === 0)
      return { exitCode: 1, stdout: loaded.problems.join("\n") || "No templates were found." };
    const wanted = options.get("stack");
    const stacks =
      wanted === undefined ? loaded.stacks : loaded.stacks.filter((s) => s.name === wanted);
    if (stacks.length === 0) return usageError(`no stack named ${wanted ?? ""}`);
    const graph = fromStacks(stacks);
    graph.title = stacks.length === 1 ? (stacks[0]?.name ?? "Architecture") : "Architecture";
    graph.notes.push("Shows what the templates define, not what is deployed in an account.");
    return finish(graph, ["synthesized templates (declared)"], loaded.problems);
  }

  if (command === "generate") {
    const from = options.get("from");
    if (from === undefined) return usageError("generate needs --from <file>");
    const file = readJson(deps.root, from);
    if (!file.ok) return { exitCode: 1, stdout: file.error };
    const value = file.value;
    const plan = planCodec.validate(value);
    if (plan.ok) return finish(fromPlan(plan.value), ["architecture plan (intended)"], []);
    if (isInventory(value))
      return finish(
        fromInventory(value),
        ["supplied inventory (deployed; relations inferred unless marked observed)"],
        [],
      );
    const graph = parseGraph((value as { graph?: unknown } | null)?.graph ?? value);
    if (graph.ok) return finish(graph.graph, ["supplied graph"], []);
    return {
      exitCode: 1,
      stdout: `${from} is not an architecture plan, an inventory, or a graph (${graph.error}).`,
    };
  }

  if (command === "from-asl") {
    if (a === undefined) return usageError("from-asl needs a file");
    const file = readJson(deps.root, a);
    if (!file.ok) return { exitCode: 1, stdout: file.error };
    const graph = fromStateMachine(file.value, "State machine");
    if (graph.nodes.length === 0) return { exitCode: 1, stdout: `${a} has no States to draw.` };
    return finish(graph, ["state machine definition (declared)"], []);
  }

  if (command === "validate") {
    if (a === undefined) return usageError("validate needs a graph file");
    const g = graphFile(deps.root, a);
    if (!g.ok) return { exitCode: 1, stdout: g.error };
    const problems = validateGraph(g.graph, { acyclic: flags.has("acyclic") });
    const errors = problems.filter((p) => p.severity === "error").length;
    return {
      exitCode: errors > 0 ? 1 : 0,
      stdout: json
        ? JSON.stringify({ problems }, null, 2)
        : problems.length === 0
          ? `Valid: ${g.graph.nodes.length} node(s), ${g.graph.edges.length} edge(s).`
          : problems.map((p) => `${p.severity}: ${p.message}`).join("\n"),
    };
  }

  if (command === "update") {
    const changeFile = options.get("change");
    if (a === undefined || changeFile === undefined)
      return usageError("update needs a graph and --change <file>");
    const g = graphFile(deps.root, a);
    if (!g.ok) return { exitCode: 1, stdout: g.error };
    const change = readJson(deps.root, changeFile);
    if (!change.ok) return { exitCode: 1, stdout: change.error };
    const updated = applyChange(g.graph, change.value as Change);
    const reparsed = parseGraph(updated);
    if (!reparsed.ok)
      return { exitCode: 1, stdout: `The change gives an invalid graph: ${reparsed.error}` };
    const out = options.get("out");
    const diff = diffGraphs(g.graph, reparsed.graph);
    const summary = `+${diff.addedNodes.length}/-${diff.removedNodes.length} nodes, +${diff.addedEdges.length}/-${diff.removedEdges.length} edges`;
    if (out === undefined || !flags.has("write"))
      return print(
        { graph: reparsed.graph, diff },
        `${summary}\n${toMermaid(reparsed.graph)}\n(Add --out <file> --write to save the updated graph as a new file.)`,
      );
    const written = writeNew(deps.root, out, `${JSON.stringify(reparsed.graph, null, 2)}\n`);
    return written.ok
      ? print({ written: written.file, diff }, `${summary}\nCreated ${written.file}`)
      : { exitCode: 1, stdout: written.error };
  }

  if (command === "diff") {
    if (a === undefined || b === undefined) return usageError("diff needs two graph files");
    const before = graphFile(deps.root, a);
    const after = graphFile(deps.root, b);
    if (!before.ok) return { exitCode: 1, stdout: before.error };
    if (!after.ok) return { exitCode: 1, stdout: after.error };
    const diff = diffGraphs(before.graph, after.graph);
    const merged = mergeForDelta(before.graph, after.graph);
    const text = [
      `Nodes: +${diff.addedNodes.length} -${diff.removedNodes.length} ~${diff.changedNodes.length}; edges: +${diff.addedEdges.length} -${diff.removedEdges.length}`,
      ...diff.addedNodes.map((n) => `  + ${n.id} (${n.kind})`),
      ...diff.removedNodes.map((n) => `  - ${n.id} (${n.kind})`),
      ...diff.changedNodes.map((c) => `  ~ ${c.after.id}`),
      "",
      "```mermaid",
      toMermaid(merged.graph, { classes: merged.classes }),
      "```",
    ].join("\n");
    return print(diff, text);
  }

  if (command === "export") {
    const out = options.get("out");
    if (a === undefined || out === undefined)
      return usageError("export needs a graph and --out <name>");
    const g = graphFile(deps.root, a);
    if (!g.ok) return { exitCode: 1, stdout: g.error };
    const format = options.get("format") ?? "mmd";
    if (!["mmd", "svg", "png"].includes(format))
      return usageError("--format must be mmd, svg, or png");
    const base = out.replace(/\.(mmd|svg|png)$/, "");
    const source = toMermaid(redactGraph(g.graph).graph);
    const lines: string[] = [];
    const src = writeNew(deps.root, `${base}.mmd`, `${source}\n`);
    lines.push(src.ok ? `Created ${src.file}` : `Not written: ${src.error}`);
    let exitCode = src.ok ? 0 : 1;
    if (format !== "mmd") {
      const image = await renderImage(
        source,
        format as "svg" | "png",
        deps.root,
        deps.env ?? process.env,
        deps.run,
      );
      if (image.ok && image.data !== undefined) {
        const written = writeNew(deps.root, `${base}.${format}`, image.data);
        lines.push(written.ok ? `Created ${written.file}` : `Not written: ${written.error}`);
        if (!written.ok) exitCode = 1;
      } else lines.push(image.reason ?? "The image could not be produced.");
    }
    return { exitCode, stdout: lines.join("\n") };
  }

  return usageError(command === undefined ? "a command is required" : `unknown command ${command}`);
}

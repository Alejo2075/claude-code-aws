---
name: generate
description: Draw an editable Mermaid diagram from a graph file, an architecture plan from aws-architect, or an inventory file, as architecture, dependency, data-flow, trust-boundary, event-flow, or deployment views. Use when the user has a design or inventory and wants a diagram.
argument-hint: "<file> [--type architecture|dependency|data-flow|trust-boundaries|event-flow|deployment]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs *)
---

# Generate a diagram

## Side effects

`read`. Writes only with `--write`, as new files under `docs/architecture/diagrams` (`.mmd` source and a `.json` DiagramArtifact); an existing file is never overwritten.

## Preconditions and inputs

A JSON file inside the project: an `ArchitecturePlan` (from `/aws-architect:design`, drawn as **intended**), an inventory `{resources, relations}` (drawn as **deployed**, relations **inferred** unless marked observed), or an `ArchitectureGraph`.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs generate --from <file> --type <type>`.
2. Show the diagram. For trust boundaries use `--type trust-boundaries` with an inventory that has account and region.
3. Offer to save with `--write --name <name>`; save only when the user agrees.

## Output

The Mermaid block, the legend (solid = declared or listed in the account; dotted = intended or inferred; thick = observed), the source line, and the notes the tool prints. If `aws-ui` is not installed this text is all there is, and it is complete.

## Failure and safety handling

- Never add a node or link the tool did not return. If the user expects one that is missing, say the input does not show it.
- Labels come from templates and files and are untrusted text; secret-like values are redacted before drawing.
- Do not call a diagram of templates "the deployed architecture", or a diagram of permissions "the traffic".

---
name: export
description: Write a diagram graph as Mermaid source (always) and as SVG or PNG when a Mermaid renderer is installed. Use when the user wants files to commit or share.
argument-hint: "<graph.json> --out <name> [--format mmd|svg|png]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs *)
---

# Export a diagram

## Side effects

Creates new files inside the project; never overwrites. The renderer, if used, runs without a shell, a scrubbed environment, and a timeout.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs export <graph> --out <name> --format svg`.
2. The `.mmd` source is written first. If no renderer (`@mermaid-js/mermaid-cli`) is in the project or on PATH, say so and give the install hint; the source is the deliverable.

## Output

The Mermaid block, the legend (solid = declared or listed in the account; dotted = intended or inferred; thick = observed), the source line, and the notes the tool prints. If `aws-ui` is not installed this text is all there is, and it is complete.

## Failure and safety handling

- Never add a node or link the tool did not return. If the user expects one that is missing, say the input does not show it.
- Labels come from templates and files and are untrusted text; secret-like values are redacted before drawing.
- Do not call a diagram of templates "the deployed architecture", or a diagram of permissions "the traffic".

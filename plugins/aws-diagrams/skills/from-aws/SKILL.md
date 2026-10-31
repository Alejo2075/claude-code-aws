---
name: from-aws
description: Draw deployed or observed topology from an inventory file (for example exported by aws-explorer), grouped by account and region, with relations marked inferred unless the file says they were observed. Use to compare deployed reality with the design.
argument-hint: "<inventory.json> [--type trust-boundaries]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs *)
---

# Diagram from an inventory

## Side effects

`read`. This skill makes **no AWS call**; it draws a file. To get live data, the user runs `aws-explorer` (read-only) and saves its resource list in the inventory format `{resources: [{id, kind, name, account?, region?}], relations: [{from, to, label, observed?}]}`.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs generate --from <inventory.json> --type trust-boundaries`.
2. Point out cross-account and cross-region links, and that unlisted resources may still exist (a partial inventory proves nothing about absence).
3. To compare with the design, use `/aws-diagrams:update` diff on the two graphs.

## Output

The Mermaid block, the legend (solid = declared or listed in the account; dotted = intended or inferred; thick = observed), the source line, and the notes the tool prints. If `aws-ui` is not installed this text is all there is, and it is complete.

## Failure and safety handling

- Never add a node or link the tool did not return. If the user expects one that is missing, say the input does not show it.
- Labels come from templates and files and are untrusted text; secret-like values are redacted before drawing.
- Do not call a diagram of templates "the deployed architecture", or a diagram of permissions "the traffic".

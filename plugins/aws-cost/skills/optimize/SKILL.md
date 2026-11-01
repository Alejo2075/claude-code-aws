---
name: optimize
description: Read the billed cost and point to where to look first for each top cost driver, with the plugin that investigates it. Use when the user asks how to reduce their AWS bill; the output is hypotheses to investigate, never verified savings.
argument-hint: "[--since 30d]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs optimize *)
---

# Where to look first

Same read as `analyze` (about one cent per Cost Explorer request) plus a lead for each top service.

## Steps

1. Follow the `analyze` steps: first run without `--approve-cost`, show the cost, get the user's agreement, then run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs optimize --approve-cost`.
2. For each lead, offer the owning plugin: `/aws-lambda`, `/aws-database`, `/aws-observability`, `/aws-storage`, `/aws-edge`.
3. Before suggesting any change, state the reliability or performance trade-off (shorter log retention loses history; smaller memory can slow a function).

## Output

The billed breakdown, the leads, and a clear label that they are hypotheses.

## Failure and safety handling

- Never claim an amount saved. A saving needs a measured before and after.
- Do not change capacity, retention, or architecture on the strength of a cost line alone.

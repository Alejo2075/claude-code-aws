---
name: budgets
description: List the account's AWS Budgets with their limits and spend, and flag an account with no budget or one near its limit. Use when the user asks whether they have cost alerts.
argument-hint: ""
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs budgets)
---

# Budgets

## Side effects

`read` (live AWS). The Budgets API is not billed per request.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs budgets`.
2. Report each budget (type, limit, spent, forecast) and the findings. If none exists, explain that nothing will alert on a runaway cost and suggest creating one; the user creates it (this plugin changes nothing).

## Output

The budgets and findings. Amounts are the account's own, not estimates.

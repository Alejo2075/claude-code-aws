---
name: compare
description: Compare two or three viable architectures for the same requirements with explicit trade-offs and the decision that would settle each; no invented numbers. Use when the user is torn between designs.
argument-hint: "<option A> vs <option B>"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs decisions *)
---

# Compare architectures

## Side effects

`read`.

## Steps

1. Restate the requirements that decide the choice (latency, ordering, volume, team skills, cost ceiling). Ask for the ones that are missing.
2. For each building-block choice involved, run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs decisions <topic>` (api-type, messaging, workflow, integration, data-store, sync-async) and use its "ask first" questions.
3. Present a table: option, what it is good at, what it costs in complexity or money, the failure mode that worries you most, and the single fact that would change the recommendation.
4. For cost, use `/aws-cost:estimate` with numbers the user provides. For a bounded experiment, suggest `/aws-prototyping:start` with a success metric.

## Output

The comparison table, a recommendation that names the requirement it rests on, and what was rejected and why.

## Failure and safety handling

- Do not quote prices, quotas, or latencies from memory.
- The decision tables are summaries; send the user to the source link for anything expensive or hard to reverse.

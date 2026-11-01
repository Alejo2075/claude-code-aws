---
name: compare
description: Compare the cost of alternatives from the same inputs: Lambda memory sizes using durations measured at each size, x86 against Graviton, HTTP API against REST API. Use when the user asks which option is cheaper, or whether more memory pays for itself.
argument-hint: "lambda-memory | lambda-arch | api-kind"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs compare *)
---

# Cost comparison

## Side effects

`read`. No AWS call and nothing written.

## Preconditions and inputs

- `lambda-memory`: requests per month and **measured** average durations at each memory size (`--points 128:900,256:520,512:300`). Without measurements, ask for them: duration depends on the memory setting and on the workload, and a guess makes the comparison meaningless.
- `lambda-arch`: the memory, and the measured duration on x86 and on Graviton.
- `api-kind`: requests per month.

## Read-only reconnaissance

Measured durations come from the user's own tests or from `/aws-observability:metrics`; do not estimate them.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs compare <kind> ... --json`.
2. Report the options, the cheapest, and the notes about what the numbers do not cover.

## Agents and tools

The Bash tool, restricted to this plugin's `compare` command. No agent and no MCP server.

## Output

The monthly figures (estimated, list prices, dated), the cheapest option, and the trade-offs the notes name: latency, features (REST API keys and caching), compatibility (arm64), and timeouts at small memory sizes.

## Failure, permission, cost, and safety handling

Never change a function's memory, architecture, or API type from this skill; propose it for the user to decide, with its reliability trade-off.

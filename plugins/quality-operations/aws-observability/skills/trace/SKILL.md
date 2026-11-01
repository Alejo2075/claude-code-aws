---
name: trace
description: Say whether active X-Ray tracing is on for a Lambda function. It does not read traces yet. Use when the user asks if a function is traced or how to follow a request across services.
argument-hint: "--function <name>"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs trace *)
---

# Tracing configuration

## Side effects

`read`. One `GetFunctionConfiguration` request.

## Preconditions and inputs

A function name, AWS credentials, and a region.

## Read-only reconnaissance

Use the command only.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs trace --function <name> --json`.
2. Report whether tracing is active and what that does and does not give the user.

## Agents and tools

The Bash tool, restricted to this plugin's `trace` command. No MCP server.

## Output

Tracing active or not. Be explicit that **traces are not read by this version**: point to the X-Ray console or CLI, and never describe a request path you did not observe.

## Failure, permission, cost, and safety handling

Distinguish a flow inferred from the template or the code from one observed in a trace; this skill observes neither.

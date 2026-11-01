---
name: alarms
description: List CloudWatch alarms with their state, optionally by name prefix or state. Use when the user asks what is alarming or which alarms exist. It creates nothing.
argument-hint: "[--prefix <text>] [--state ALARM|OK|INSUFFICIENT_DATA]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs alarms *)
---

# Alarms

## Side effects

`read`. One `DescribeAlarms` request, at most 100 alarms.

## Preconditions and inputs

AWS credentials and a region. Alarms are per region.

## Read-only reconnaissance

Use the command only.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs alarms --state ALARM --json`.
2. For each alarm in `ALARM`, give the reason AWS states and suggest `/aws-observability:investigate` for the resource behind it.

## Agents and tools

The Bash tool, restricted to this plugin's `alarms` command. No MCP server.

## Output

The alarms by state. If none matched, say that this region and account show none, not that none exist.

## Failure, permission, cost, and safety handling

Never create, change, or silence an alarm from here. Alarms are infrastructure: they belong in the CDK app (`aws-infrastructure`).

---
name: metrics
description: Standard CloudWatch metrics for a Lambda function (invocations, errors, throttles, duration, concurrency) or an SQS queue (age of the oldest message, visible messages) as time series. Use when the user asks for numbers over time.
argument-hint: "--function <name> | --queue <name> [--since 1h]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs metrics *)
---

# Metrics

## Side effects

`read`. One `GetMetricData` request for the standard bundle (billed per metric requested).

## Preconditions and inputs

A function or queue name and a range of 1 minute to 24 hours. The period is chosen from the range (60 s up to an hour, then 5 and 15 minutes).

## Read-only reconnaissance

Use the command; do not estimate from logs what a metric would show.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs metrics --function <name> --json`.
2. Describe the shape (when it started, how large) with the timestamps from the series.

## Agents and tools

The Bash tool, restricted to this plugin's `metrics` command. No MCP server.

## Output

The series, their period and range, and the caveat that metrics lag by about a minute and missing points can mean no traffic.

## Failure, permission, cost, and safety handling

Report a missing permission by the action AWS names. Do not extrapolate beyond the window.

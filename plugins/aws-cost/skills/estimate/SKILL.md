---
name: estimate
description: Estimate the monthly cost of a serverless workload (Lambda, API Gateway, DynamoDB on-demand, SQS, SNS, Step Functions Standard, CloudWatch Logs) from stated inputs and dated AWS list prices, with assumptions, exclusions, and sensitivity. Use when the user asks what a workload would cost, or how cost grows with traffic.
argument-hint: "[describe the workload]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs estimate *), Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs prices *)
---

# Cost estimate

Computes a monthly **estimate** from inputs and a dated snapshot of the public AWS list prices (us-east-1). It is not a bill, not an invoice forecast, and not measured spending.

## Side effects

`read`. No AWS call, no network, nothing written.

## Preconditions and inputs

The numbers must come from the user or from measurement; **never invent them**. Ask for what is missing:

- Lambda: requests per month, average billed duration in ms **at the configured memory**, memory in MB, x86 or Graviton, retry rate.
- API Gateway: HTTP or REST, requests per month.
- DynamoDB on-demand: read and write request units per month.
- SQS / SNS: requests per month (an SQS message needs at least three requests). Step Functions Standard: transitions per month. CloudWatch Logs: GB ingested and stored.

Only us-east-1 prices are available. For another region, say the estimate is indicative only.

## Read-only reconnaissance

If the user has a CDK app, `/aws-infrastructure:inspect` shows which services it uses, which tells you which sections you need. Traffic numbers still come from the user.

## Steps

1. Build the workload JSON from the user's numbers.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs estimate --workload '<json>' --sensitivity --json`.
3. Present the total, the lines, the assumptions, the rate date, and what is **not included**.
4. Use the sensitivity table to show how the cost scales, and say which line dominates.

## Agents and tools

The Bash tool, restricted to this plugin's `estimate` and `prices` commands. No agent and no MCP server.

## Output

Always label the figure **estimated**, give its date, and list the exclusions: free tier, credits, discounts, tax, data transfer, NAT, KMS, X-Ray, metrics, alarms, other services. Never call it the bill.

## Failure, permission, cost, and safety handling

- If an input is a guess, say so next to the number it affects.
- Do not mix this with actual spending: for billed amounts the user needs Cost Explorer, which this version does not read.
- Do not recommend changing capacity, retention, or architecture on the strength of an estimate alone; name the reliability trade-off.

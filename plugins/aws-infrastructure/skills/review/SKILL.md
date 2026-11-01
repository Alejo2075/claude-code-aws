---
name: review
description: Review the operational quality of a CDK app from its synthesized templates: dead-letter queues, visibility timeouts against function timeouts, runtime support, log retention, deletion policies, point-in-time recovery, tracing, alarms. Use when the user asks for an infrastructure review or whether the app is production ready.
argument-hint: "[path to cdk.out or a template]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs review *)
---

# Infrastructure review

Runs a pack of deterministic rules over the synthesized templates and reports findings with evidence. Each finding names its rule, the resource, the template location, and the AWS documentation that supports it.

## Side effects

`read`. Local template files only.

## Preconditions and inputs

- A `cdk.out` directory or template in the project (run `/aws-infrastructure:synth` first if missing).
- Security issues (IAM, public access, encryption) belong to `aws-security`; this review covers operations and durability.

## Read-only reconnaissance

Do not re-derive findings by reading the CDK code. Do not claim a finding the command did not report.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs review --json`.
2. Group the findings by severity. For each, give the resource, why it matters, and the fix from `recommendation`.

## Agents and tools

The Bash tool, restricted to this plugin's `review` command. No agent and no MCP server.

## Output

A short verdict first (how many findings, how many high), then the findings in order of severity, then the limitations. If the command reports no findings, say that the rules found none and name what they do not cover.

## Failure, permission, cost, and safety handling

- Findings are about the template, not the deployed account.
- An informational finding is not a defect. Do not present it as one.
- Offer to apply a fix only as a code change the user can review; never deploy.

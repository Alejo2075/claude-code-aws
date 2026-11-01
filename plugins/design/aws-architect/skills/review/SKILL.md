---
name: review
description: DEPRECATED, prefer /aws-well-architected:review (all six pillars, evidence ledger, backlog). Answer the Well-Architected Serverless Lens style questions that a synthesized template can answer (dead-letter queues, visibility timeouts, tracing, alarms, log retention, authorizers, least privilege, public access), with evidence, and list what only the team or the account can answer. Use for an architecture review of an existing CDK app.
argument-hint: "[path to cdk.out or template]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs review *), Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs diagram *)
---

# Architecture review (deprecated)

The Well-Architected style review moved to the `aws-well-architected` plugin. This skill keeps working with the same question bank; suggest `/aws-well-architected:review` when that plugin is installed. For design commentary and trade-offs, use `/aws-architect:decide` and `/aws-architect:design`.

## Side effects

`read`. No AWS call.

## Preconditions and inputs

A synthesized `cdk.out` or template (see `/aws-architect:diagram`).

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs review <path>`.
2. Report each answer as returned: `yes`, `partly`, `no`, or `not-in-template`, with its evidence line and source link.
3. Group by pillar. Lead with the `no` and `partly` answers.
4. For the `not-in-template` answers, say who can answer (the team, the account, the code) and offer the right next step, for example `/aws-security:review` for IAM or `/aws-observability:status` for what is actually deployed.

## Output

Findings per stack: question, answer, evidence, source. End with what was **not** covered.

## Failure and safety handling

- This is **not** a Well-Architected Framework Review and gives no score. It is a subset of questions a template can speak to. Say so.
- An answer of `yes` means the template has the property, not that the system behaves well. Do not claim the architecture is reliable or secure.
- Do not recommend a change without naming its cost or complexity trade-off.

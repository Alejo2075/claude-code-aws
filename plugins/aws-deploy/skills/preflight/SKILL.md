---
name: preflight
description: Review a CDK app against the AWS account before deploying: verified identity, environment, bootstrap, synthesis, diff against what is deployed, stateful replacements, permission changes. Use when the user asks if a deployment is safe, what it would change, or before planning a deploy.
argument-hint: "[--stack <name>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs preflight *)
---

# Deployment preflight

Reviews the app against the account and reports each check. It changes nothing in AWS and saves nothing.

## Side effects

`read`. One STS call and read-only CloudFormation calls (`DescribeStacks`, `GetTemplate`). It synthesizes the app **without AWS credentials** (the project's code runs with an allowlisted environment and a private home), which writes `cdk.out` in the project.

## Preconditions and inputs

- A `cdk.json` and `aws-cdk` in the project, and working AWS credentials. The region comes from `--region`, `AWS_REGION`, or the profile.
- The environment (production or not) comes only from the user's own `aws-context` configuration. An unclassified account is treated like production.

## Read-only reconnaissance

Read the command's output. Do not infer the account or the environment from a profile name or a stack name.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs preflight --json`.
2. Report each check, then the destructive changes and permission changes.
3. Say plainly what was **not** checked: tests and the security audit. Offer `/aws-testing:run` and `/aws-security:audit`.

## Agents and tools

The Bash tool, restricted to this plugin's `preflight` command. No agent and no MCP server.

## Output

A one-line verdict, the checks, and what each acknowledgment would be needed. The diff is a template comparison, not a change set.

## Failure, permission, cost, and safety handling

- A failed check blocks: report it and the way to fix it. Never sign in or change profile for the user.
- Never deploy from this skill.

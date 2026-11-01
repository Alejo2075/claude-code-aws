---
name: deploy
description: Deploy exactly the templates a saved plan reviewed, after re-checking the account, region, and template hashes and the acknowledgments. Use only when the user explicitly asks to deploy a specific plan id.
argument-hint: "<plan id> [--confirm <text>] [--accept-destructive <ids>] [--accept-security-changes]"
disable-model-invocation: true
---

# Deploy a plan

Deploys the reviewed cloud assembly with the user's own AWS credentials. It refuses unless every condition of the plan holds.

## Side effects

`cloud-mutate`. It changes AWS resources: it runs `cdk deploy` from the reviewed `cdk.out` for the planned stacks. **Invocation is manual** and this skill declares no pre-approved tools, so Claude Code shows the exact command for the user's approval every time.

## Preconditions and inputs

- A plan id from `/aws-deploy:plan`, less than an hour old, for this project.
- For production or an unclassified account: `--confirm <account>:<region>:<stacks>`, exactly as the plan printed it.
- For each destructive change: `--accept-destructive <id>`. For permission-broadening changes: `--accept-security-changes`.
- **Only add an acknowledgment the user has read and agreed to.** Never add one to make the command pass.

## Read-only reconnaissance

Before running, show the user the plan's target (account, region, environment, stacks) and the acknowledgments, and get their explicit go-ahead.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs deploy <plan id> [acknowledgments]`.
2. The command verifies the identity again, re-synthesizes without credentials, compares template hashes, and checks the gates. If anything differs it prints what and exits without deploying.
3. On success it reports the stack status read back from CloudFormation. On failure it says so; CloudFormation rolls back failed updates by itself.

## Agents and tools

The Bash tool, with the user approving the command. No agent and no MCP server.

## Output

Deployed or not, the status of each stack, and the redacted tail of the output. If it failed, point to `/aws-deploy:status` and `/aws-deploy:rollback`.

## Failure, permission, cost, and safety handling

- Never hotswap, never skip a gate, never edit the plan, never retry with different acknowledgments without asking.
- If a gate refuses, explain it and let the user decide. A new `plan` is the way forward after any change.
- Do not promise rollback: completed deployments are not undone by a command, and data changes are irreversible.

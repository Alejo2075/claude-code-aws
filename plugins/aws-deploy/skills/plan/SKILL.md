---
name: plan
description: Make a deployment plan: run the preflight and save a one-hour plan bound to the account, region, and a hash of every reviewed template. Use when the user wants to deploy, so the review and the deployment are the same thing.
argument-hint: "[--stack <name>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs plan *)
---

# Deployment plan

Runs the preflight and, if nothing blocks, saves a plan. The plan holds the account, region, environment, stack names, template hashes, and the destructive and permission changes that need acknowledgment. It holds no secrets.

## Side effects

`local-write`: one small file under the Claude config directory (private, expires in one hour, older plans are removed). Otherwise as the preflight. Nothing is deployed.

## Preconditions and inputs

As the preflight.

## Read-only reconnaissance

As the preflight.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs plan --json`.
2. Show the user the checks and the plan: the stacks, account, region, environment, and every change that needs acknowledgment.
3. Give them the exact `/aws-deploy:deploy <plan id> ...` line the command printed. Do not run it.

## Agents and tools

The Bash tool, restricted to this plugin's `plan` command. No agent and no MCP server.

## Output

The plan id, its expiry, the target, and the acknowledgments required. Make clear that the user decides whether to deploy.

## Failure, permission, cost, and safety handling

- If the plan is blocked, no plan exists: say why.
- Do not reuse an old plan after the code changed: deployment refuses it, and so should you.

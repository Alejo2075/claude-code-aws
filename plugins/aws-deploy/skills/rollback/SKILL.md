---
name: rollback
description: Explain what can and cannot be undone for a stack in its current state, with the commands the user may run. Executes nothing. Use when a deployment failed, a stack is stuck, or the user asks to roll back.
argument-hint: "<stack>"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs rollback *)
---

# Rollback options

## Side effects

`read`. It never runs a recovery command.

## Preconditions and inputs

A stack name, AWS credentials, and a region.

## Read-only reconnaissance

Use the command's output only.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs rollback <stack> --json`.
2. Explain the state, the options, and the commands for the user to run.
3. List the resources whose data is not restored by redeploying earlier code.

## Agents and tools

The Bash tool, restricted to this plugin's `rollback` command. No agent and no MCP server.

## Output

The state in plain words, the options in order of safety, and the irreversible parts. Say clearly that a completed deployment has no undo command.

## Failure, permission, cost, and safety handling

- Never run `continue-update-rollback`, `delete-stack`, or any recovery command for the user. Give it; they decide.
- Deleting a stack deletes its resources: say what will go.

---
name: iam
description: Analyze IAM and resource policies from templates or a pasted policy, or explain an AccessDenied message. Use when the user asks who can do what, whether a policy is too broad, why a call was denied, or what permission is missing.
argument-hint: '[path] | --policy <file> [--trust|--resource] | --explain "<message>"'
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs iam *)
---

# IAM analysis

Lists the policy statements in the templates (or one pasted policy) with IAM findings, or reads an `AccessDenied` message and says what it states.

## Side effects

`read`. Local files and the message you give it. It does not call AWS and does not simulate policies.

## Preconditions and inputs

- A template path, `--policy <file>` (add `--trust` for a trust policy, `--resource` for a resource policy), or `--explain "<the full message>"`.
- For `--explain` the user must provide the **complete** message, including the part that starts with `User:` or `Role:`.

## Read-only reconnaissance

Do not guess the denial cause from the action name. If the message has no cause, say so and ask for the full text or for CloudTrail.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs iam ... --json`.
2. For `--explain`: report the cause the message names, what to check, and, only for an implicit deny in an identity policy, the proposed minimal statement, **labeled a proposal**.
3. For templates or a policy: report the findings and the statements that cause them.

## Agents and tools

The Bash tool, restricted to this plugin's `iam` command. No agent and no MCP server.

## Output

The cause (or "not stated"), the checks in order, and the proposal if any. State that an explicit deny cannot be fixed by adding an Allow, and that cross-account access needs both sides to allow it.

## Failure, permission, cost, and safety handling

- The proposed statement is never applied. The user reviews it, scopes the resource, and adds conditions.
- Never suggest `Action: *` or `Resource: *` as a fix.
- The analysis cannot see the actual policies behind a message, so it cannot confirm that the proposal is enough.

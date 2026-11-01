---
name: analyze
description: Read the account's billed cost from Cost Explorer for a recent window, grouped by service, Region, or account, with an announced request budget (each request costs about one cent). Use when the user asks what they actually spent, as opposed to an estimate.
argument-hint: "[--since 30d] [--group-by service|region|account]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs analyze *), Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs budgets)
---

# Billed cost (actual)

Reads **what AWS billed**, which is different from an estimate (`/aws-cost:estimate`) and from a saving.

## Side effects

`read` (live AWS), **billed**: Cost Explorer charges about $0.01 per request, and each result page is a request. The command defaults to at most 2 requests and never exceeds the limit it announces.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs analyze --since 30d` **without** `--approve-cost`. It verifies the account with STS and prints the window, the request limit, and the maximum cost, and reads nothing.
2. Tell the user the account (masked), the window, and the maximum cost, and ask if they want to proceed.
3. Only after they agree, run it again with `--approve-cost` (add `--max-requests 1` to cap the cost at one cent).
4. Present the total, the top lines, and the limitations the command prints (data lag, estimated latest period, what is included).

## Output

Billed amounts by group with shares, the number of requests made and their cost, and the caveats.

## Failure and safety handling

- Never run with `--approve-cost` without the user's agreement in this conversation.
- Never present billed amounts as a forecast, and never call a hypothesis a saving.
- If the identity cannot be verified, nothing is read.

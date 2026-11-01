---
name: decide
description: Show the trade-offs between common serverless choices (HTTP vs REST API, SQS vs SNS vs EventBridge, Step Functions Standard vs Express, Lambda vs direct integration, DynamoDB vs relational, sync vs async) with the questions to ask first and the AWS source for each. Use when the user is choosing between alternatives.
argument-hint: "[api-type|messaging|workflow|integration|data-store|sync-async]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs decisions *), Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs adr *)
---

# Decision tables

## Side effects

`read`. An ADR is written only if the user asks for it (see below).

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs decisions <topic>` (no topic lists them).
2. Ask the "ask first" questions before recommending an option; the answer to them decides.
3. Present the options with when to use each and what to watch out for. Give a recommendation only after the user's answers, and say which answer it rests on.
4. Offer to record the decision as an ADR: run `adr --title ... --decision ... --option ...` without `--write` to show the draft. Write the file (`--write`) only after the user agrees; it creates `docs/adr/NNNN-title.md` and never overwrites one.

## Output

The options, the questions, the source link, and the snapshot date.

## Failure and safety handling

- The tables are **summaries** of AWS guidance, not line-by-line verified; tell the user to open the source before a costly decision.
- Quotas and prices change: do not quote numbers from memory. For cost, use `/aws-cost:compare`.

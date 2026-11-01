---
name: contracts
description: Event fixtures for Lambda sources (API Gateway HTTP and REST, SQS, SNS, EventBridge, DynamoDB Streams, S3, Step Functions) with malformed and edge-case variants, and a check for a handler's response shape. Use when the user needs a sample event, wants to test error handling, or asks whether a handler's response is valid.
argument-hint: "list | show <kind> [--variant name] | write <kind> --dir <dir> | check <kind> '<response>'"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs contracts *)
---

# Event contracts

Prints or writes realistic events with placeholder identifiers, and validates the response a handler returns for SQS partial batches and API Gateway proxy integrations.

## Side effects

`read` for `list`, `show`, and `check`. `write` creates fixture files only with `--write`, and never overwrites.

## Preconditions and inputs

- An event kind from `contracts list`. Each kind links the AWS documentation its shape follows.

## Read-only reconnaissance

Use `contracts list` to see the variants rather than inventing malformed events by hand.

## Steps

1. `contracts show <kind> [--variant <name>]` for a sample, for example `sqs --variant batch-one-bad`.
2. `contracts check sqs '<response JSON>' '<event JSON>'` to verify a partial-batch response names only records of the batch.
3. Use the variants to test: malformed body, empty records, duplicate delivery, one bad record in a batch, redelivery, missing authorizer claims, base64 bodies.

## Agents and tools

The Bash tool, restricted to this plugin's `contracts` command. No agent and no MCP server.

## Output

The event or the check result, with the reason for each problem.

## Failure, permission, cost, and safety handling

- The fixtures are samples of the documented shape, not captures from your account. Real events may carry more fields: handlers should tolerate them.
- Do not paste real events containing customer data into fixtures.

---
name: generate
description: Generate tests: policy assertions for a synthesized CDK stack (queues have dead-letter queues, functions have timeouts, tables have recovery, no * on *), and a unit-test skeleton for a Lambda handler built on event fixtures. Use when the user asks for tests for a handler or for infrastructure checks.
argument-hint: "cdk-assertions <stack> | handler <file> <kind>"
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs generate *)
---

# Generate tests

Writes test files from deterministic generators. You then add the cases that need domain knowledge.

## Side effects

`local-write` with `--write`: creates files under `test/` and never overwrites. Without `--write` it only shows what it would create. Manual invocation because it writes files.

## Preconditions and inputs

- `cdk-assertions <stack>`: a synthesized `cdk.out` (run `/aws-infrastructure:synth`). The assertions read the template, so they check policy and keep holding while values change.
- `handler <file> <kind>`: the handler file and an event kind (`sqs`, `apigw-http-v2`, `apigw-rest-v1`, `sns`, `eventbridge`, `dynamodb-stream`, `s3`, `stepfunctions-task`).

## Read-only reconnaissance

Read the handler to see what it does with the event and with AWS before writing the extra cases.

## Steps

1. Run without `--write` and show the user what would be created.
2. After they agree, run with `--write`.
3. Replace each `TODO` with a real test: the business rule that decides success or failure, and the exact parameters of every AWS call (with a mock of the SDK client).
4. Run `/aws-testing:run --affected`.

## Agents and tools

The Bash tool, restricted to this plugin's `generate` command. No agent and no MCP server.

## Output

The files created and what each checks. Name what the generated tests do **not** cover: behavior of the deployed resources, permissions at run time, and anything in the TODO list.

## Failure, permission, cost, and safety handling

- Do not weaken or delete a generated assertion to make a test pass. If it fails, the template really breaks the policy: fix the infrastructure or discuss it with the user.
- Never put real credentials, real account ids, or real customer data in fixtures.
- Mocks are not AWS integration coverage: say so.

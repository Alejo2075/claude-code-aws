---
name: scaffold
description: Generate CDK TypeScript for a common serverless pattern (queue to Lambda to DynamoDB, HTTP API with Cognito, S3 to SQS to Lambda) with secure defaults and a test. Use when the user asks to start or add one of these patterns to a CDK project.
argument-hint: "<pattern> <Name> [--write]"
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs scaffold *)
---

# Scaffold a pattern

Generates a stack, a minimal Lambda handler, and a test for a named pattern. By default it only lists the files; `--write` creates them and never overwrites an existing file.

## Side effects

`local-write` with `--write`: creates files inside the project. Without it, `read`. It does not deploy anything. Invocation is manual because it creates files.

## Preconditions and inputs

- A pattern: `queue-lambda-dynamodb`, `http-api-cognito`, or `s3-sqs-lambda`, and a PascalCase `Name`.
- The project needs `aws-cdk-lib`, `constructs`, and Vitest.

## Read-only reconnaissance

Run without `--write` first and show the user the file list. Check that the names do not collide with existing files.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs scaffold <pattern> <Name> --json` and show the list.
2. Only after the user agrees, run it again with `--write`.
3. Tell the user to add `new <Name>Stack(app, "<Name>")` to their CDK app and run `/aws-infrastructure:synth`, then `/aws-infrastructure:review`.

## Agents and tools

The Bash tool, restricted to this plugin's `scaffold` command. No agent and no MCP server.

## Output

The files created or skipped, and the one line to add to the app. Name the secure defaults included (dead-letter queue, encryption, retained data, point-in-time recovery, tracing, log retention, named CORS origins) and what the user should change on purpose (removal policy for disposable environments, sizing).

## Failure, permission, cost, and safety handling

- An existing file is skipped, never overwritten. Say which.
- The generated code is a starting point: it has not been deployed or load-tested.
- Never deploy from here.

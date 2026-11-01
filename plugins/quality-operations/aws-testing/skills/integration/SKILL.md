---
name: integration
description: Run the project's own integration test command against a sandbox AWS account the user names, with real credentials, after the account is verified and the user confirms it is a sandbox. Use only when the user asks to run integration tests on AWS; it can create resources and cost money.
argument-hint: "--account <12-digit id> --region <region> -- <test command>"
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs integration *)
---

# Integration tests with real credentials

Runs **the user's own test command** with their AWS credentials. The tests can do whatever those credentials allow.

## Side effects

`write` (live AWS, whatever the tests do). It is manual only: never run it on your own initiative.

## Preconditions (all required)

1. `/aws-context:status` shows the account the user means, verified. The command verifies it again with STS and refuses if it differs from `--account`.
2. The user says the account is a **sandbox** and the credentials are limited to what the tests need. Only then add `--confirm-sandbox`. Never add it yourself.
3. The account is not classified production. The command refuses if it is.
4. The test command is the project's own (for example `npx vitest run tests/integration`). Read it first and say what it will create.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs integration --account <id> --region <region> --confirm-sandbox --timeout 300 -- <command...>`.
2. Report pass or fail, the duration, and the redacted output. The output is bounded.
3. Afterwards, list what the tests may have left behind (`/aws-explorer`) and ask before any cleanup; cleanup is done with the tool that created the resources.

## Output

Pass, fail, or timeout; account (masked) and region; the source stated as a real run with real credentials.

## Failure and safety handling

- No shell is used; the environment is scrubbed (endpoint overrides and NODE_OPTIONS are dropped). A timeout kills the whole process group.
- Do not run load tests or unbounded loops: cost is not bounded by this command. Cost estimates for a test belong to `/aws-cost`.
- `aws-guard` may ask for approval of the command; that is expected.

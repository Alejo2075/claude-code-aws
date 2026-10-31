# aws-testing

Run, generate, and report tests for serverless apps: Lambda handlers, CDK infrastructure, and the events that invoke them. Tests never use your AWS credentials and nothing is deployed.

## What it does

- **`run`**: runs the project's Vitest, Jest, or `node:test` and reports passed, failed, and skipped, with each failure tied to its file. `--affected` runs only the tests related to uncommitted changes (the framework's own `related` / `--findRelatedTests`). Tests run with **no AWS credentials**, a private home directory, and dummy credentials, so a unit test cannot reach your account by accident.
- **`contracts`**: event fixtures for API Gateway HTTP (payload 2.0) and REST, SQS, SNS, EventBridge, DynamoDB Streams, S3, and Step Functions tasks, each with the documentation it follows, and variants that expose error handling: malformed bodies, empty records, duplicate delivery, one bad record in a batch, redelivery, a request without authorizer claims, a base64 body, a key that needs URL decoding. `contracts check` validates a handler's response: the SQS `batchItemFailures` shape (naming only records of the batch) and API Gateway proxy responses.
- **`generate`**: `cdk-assertions` writes a test from a synthesized stack that asserts **policy**, not values (every queue that is not a DLQ has a redrive policy, every function has a timeout, tables have point-in-time recovery, stateful resources are retained, buckets block public access, no policy allows `*` on `*`), so it keeps holding while the app changes. `handler` writes a skeleton test for a handler with the events and assertions for its source, and marks the cases only you can write as `TODO`.
- **`coverage`**: totals and the least-covered files.

It does not deploy (`aws-deploy`), call AWS, or run integration tests (planned, with explicit approval and limits).

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-testing@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-testing:run --affected
/aws-testing:contracts show sqs --variant batch-one-bad
/aws-testing:generate handler src/handler.mjs sqs        # lists the file; add --write to create it
/aws-testing:generate cdk-assertions OrdersStack --write # after a cdk synth
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. The project's test framework installed (Vitest or Jest; otherwise `node --test` is used). `--affected` needs git. **No AWS account or credentials.**

## Components

| Component | Name                                        | Side effects                                                                         | Invocation          |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| Skill     | `/aws-testing:run`, `contracts`, `coverage` | Run the project's tests (no AWS access); read; `contracts write` only with `--write` | Automatic or manual |
| Skill     | `/aws-testing:generate`                     | Lists files; with `--write`, creates files under `test/`, never overwriting          | Manual only         |
| Command   | `dist/cli.mjs`                              | As above; `--json` for machine output                                                | Run by the skills   |

No hook, no agent, no MCP server. An opt-in hook that runs affected tests after edits is not included: it needs debouncing and loop protection first.

## Fixtures: what they are and are not

The events follow the AWS documentation and use placeholder identifiers (account `123456789012`, `example.com`); they are not captures from an account. Real events can carry more fields, and a handler should tolerate them. Do not paste real events with customer data into fixtures.

## Tests that use mocks are not integration coverage

A passing unit test with a mocked SDK shows that the code calls the SDK the way the test expects. It does not show that the deployed role has the permission, that the table has that key, or that the queue triggers the function. Every result says so.

## AWS permissions

None. This plugin makes no AWS calls.

## Data and privacy

Reads the project, runs the test command, and prints its report. Writes only what the framework writes (coverage) and, with `--write`, the generated test and fixture files. Test output is redacted for credentials and bounded. No telemetry.

## Capability matrix

| Capability                                              | Status                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `run` with Vitest (real runs), `--affected`, coverage   | implemented + tested                                                                          |
| `run` with Jest and `node:test`                         | implemented + tested (report parsers and plan; no real Jest run)                              |
| Event fixtures for eight sources with variants          | implemented + tested                                                                          |
| SQS partial-batch and API Gateway response validators   | implemented + tested                                                                          |
| `generate cdk-assertions` and `generate handler`        | implemented + tested (a generated SQS test passes a correct handler and fails a careless one) |
| `coverage` summary                                      | implemented + tested                                                                          |
| `integration` tests against an approved sandbox account | not yet implemented                                                                           |
| Opt-in affected-tests hook                              | not yet implemented                                                                           |
| `load` tests                                            | not yet implemented                                                                           |
| Property-based and fuzz generators                      | not yet implemented                                                                           |

## Limitations

- Handlers are called directly with a sample event; the Lambda runtime, cold starts, and timeouts are not simulated.
- `--affected` relies on the framework's notion of related files and on git.
- The generated assertions read `cdk.out`, so run a synth first.
- Tested in CI against fixtures on macOS, Linux, and Windows; not run in a real interactive session.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-testing` in a project with Vitest.
2. `/aws-testing:run` shows the results; edit a file and `/aws-testing:run --affected`.
3. `/aws-testing:generate handler <your handler> sqs --write`, replace the TODOs, and run it.
4. `/plugin disable aws-testing@claude-code-aws`: Claude Code is otherwise unchanged.

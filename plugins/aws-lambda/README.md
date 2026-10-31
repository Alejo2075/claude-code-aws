# aws-lambda

Inspect Lambda functions in synthesized CDK output, scaffold TypeScript handlers (validation, JSON logging, an idempotency hook, tests, a local harness), check configuration against Lambda's quotas, and prepare an invocation as a command for you to run. It invokes nothing.

## What it does

- **`inspect`**: functions in `cdk.out` with runtime, architecture, memory, timeout, and environment variable **names** (never values), and findings: deprecated runtimes, out-of-range memory or timeout, more than five layers, secrets in environment variables, public function URLs, no failure destination for asynchronous invocations, no tracing, x86.
- **`create`**: a handler for SQS, API Gateway (HTTP API), EventBridge, S3, SNS, or a schedule, with input validation, JSON logging, a dependency seam for idempotency, a test, a sample event, and a local harness. The generated tests are run in this plugin's own tests.
- **`invoke`**: validates the function name, region, qualifier, and payload (6 MB synchronous, 1 MB asynchronous) and prints the exact CLI command, plus a `DryRun` form. It never runs it.
- **`explain`**: memory and CPU, timeout, cold starts, architecture, VPC, concurrency, versions, and hard limits, with sources.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-lambda@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-lambda:inspect cdk.out
/aws-lambda:create --name order-worker --event sqs
/aws-lambda:invoke --function order-worker --region us-east-1 --payload event.json
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                            | Side effects                    | Invocation          |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-lambda:inspect`, `/aws-lambda:create`, `/aws-lambda:invoke`, `/aws-lambda:review`, `/aws-lambda:optimize` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                  | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                       | Status                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect`: 11 rule ids over declared functions; env values never shown           | implemented + tested                                                                                   |
| `create`: six event sources; generated tests executed under the Node test runner | implemented + tested                                                                                   |
| `invoke`: validated plan with DryRun form; never run                             | implemented + tested                                                                                   |
| `explain`: 8 topics, limits read from the Lambda quotas page on 2026-10-31       | implemented + tested                                                                                   |
| Invoking a function, reading real durations or logs                              | not implemented by design (use /aws-observability for read-only telemetry)                             |
| Live inspection through the AWS SDK                                              | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Templates show configuration, not the code or its real behavior.
- The runtime deprecation table is a dated snapshot in template-analysis.
- The scaffold uses `@types/aws-lambda` for types only; your project must have it, and the idempotency seam is a stub you must implement.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-lambda`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-lambda@claude-code-aws`: Claude Code is otherwise unchanged.

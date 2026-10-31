# aws-messaging

Inspect SQS queues and SNS topics in synthesized CDK output, check dead-letter and FIFO design, try SNS filter policies against sample messages, and form hypotheses about a backlog from numbers you supply. It sends, receives, and deletes nothing.

## What it does

- **`inspect`**: queues, topics, and subscriptions in `cdk.out`, with findings: no dead-letter queue, a dead-letter queue that keeps messages for less time than its source, a visibility timeout under six times the consumer's timeout, no partial-batch reporting, FIFO naming and deduplication needs, unencrypted topics, subscriptions without a dead-letter queue, queue policies open to any principal.
- **`filter-test`**: tries an SNS filter policy against message attributes (typed `String`, `Number`, `String.Array`) or a message body, and says which field filtered it out.
- **`fifo-check`**: what a send to a FIFO queue needs (group id, deduplication id) and what ordering you get.
- **`diagnose`**: hypotheses about a backlog from CloudWatch numbers you read yourself, each with the check that would settle it.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-messaging@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-messaging:inspect cdk.out
/aws-messaging:test policy.json message.json
/aws-messaging:diagnose --visible 1200 --in-flight 40 --oldest 900 --send-rate 80 --receive-rate 30 --visibility 60 --retention 345600 --dlq 0
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                                      | Side effects                    | Invocation          |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-messaging:inspect`, `/aws-messaging:design`, `/aws-messaging:diagnose`, `/aws-messaging:dlq`, `/aws-messaging:test` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                            | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                | Status                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect` rules (11 rule ids) over declared queues, topics, subscriptions | implemented + tested                                                                                   |
| `filter-test`: SNS filter policy matcher for attributes and body          | implemented + tested (local approximation; SNS operator differences not verified)                      |
| `fifo-check`: group and deduplication id rules                            | implemented + tested (group id limit from the SQS quotas page)                                         |
| `diagnose`: backlog hypotheses from supplied numbers                      | implemented + tested (rules of thumb, not a diagnosis)                                                 |
| Receiving, previewing, or redriving messages                              | not implemented by design (needs explicit approval and a live adapter)                                 |
| Live inspection through the AWS SDK                                       | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Templates show declared queues, not run-time depth, age, or receive counts.
- The filter matcher uses EventBridge operators; SNS supports a similar but not identical set.
- `diagnose` applies simple rules to numbers you supply; it cannot see the queue.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-messaging`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-messaging@claude-code-aws`: Claude Code is otherwise unchanged.

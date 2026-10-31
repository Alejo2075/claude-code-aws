# aws-observability

Read-only operational visibility for serverless apps: how a Lambda function or an SQS queue is doing, bounded and redacted logs, standard metrics, alarms, and an **evidence ledger** for investigating incidents. It never changes anything.

## What it does

- **`status`**: a function's configuration and recent metrics (invocations, errors, throttles, duration, concurrency), or a queue's depth, age of the oldest message, and dead-letter queue depth.
- **`logs`**: a sample of `/aws/lambda/<function>`: at most 200 events, 24 hours, 5 pages, optionally filtered, with credentials and personal data redacted and long lines shortened.
- **`metrics`**: the standard bundle as typed time series with their period and range.
- **`alarms`**: an inventory of alarms (at most 100) by prefix or state. It creates nothing.
- **`trace`**: whether active X-Ray tracing is on. It does **not** read traces yet.
- **`investigate`**: gathers configuration, metrics, and a filtered log sample into numbered ledger entries (E1, E2, ...) and reports findings that **cite them**: timeouts (from the log line and from the maximum duration), memory exhaustion (out-of-memory lines, or a REPORT that used all the memory), throttling, error rate with the common error types, cold starts. A conclusion without a ledger entry is a hypothesis with the next check that would settle it. The `incident-investigator` agent follows the same rules for long investigations.

It does not create or change alarms or dashboards (that is infrastructure, `aws-infrastructure`), redrive or purge queues, read X-Ray traces, Step Functions history, or API Gateway and DynamoDB telemetry yet, or watch anything continuously: every command makes a fixed number of calls and stops.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-observability@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-observability:status --function orders-handler
/aws-observability:investigate --function orders-handler --since 2h
/aws-observability:logs --function orders-handler --filter "Task timed out"
/aws-observability:status --queue orders
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. AWS credentials resolved the usual way, and a region (`--region`, `AWS_REGION`, or the profile's).

## Components

| Component | Name                                                                             | Side effects                                          | Invocation                        |
| --------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Skill     | `/aws-observability:status`, `logs`, `metrics`, `alarms`, `trace`, `investigate` | Read-only AWS calls, a fixed small number per command | Automatic or manual               |
| Agent     | `incident-investigator`                                                          | Runs this plugin's commands only; read-only           | Delegated for long investigations |
| Command   | `dist/cli.mjs`                                                                   | As above; `--json` for machine output                 | Run by the skills                 |

No hook and no MCP server.

## Cost and limits

Every output ends with the number of billed API calls it made. Each command makes a handful: `status` and `investigate` three or four, the others one. `FilterLogEvents` is billed like an API request, not per gigabyte scanned (this version does not use Logs Insights). `GetMetricData` is billed per metric requested. Ranges are 1 minute to 24 hours; samples are capped; AWS throttling is retried with backoff a few times and then reported.

## Evidence rules

- Findings are tagged `confirmed` only when a ledger entry shows the fact (a log line, a metric peak, a configuration value), and say what the evidence does **not** show: it never says _why_ a call is slow.
- A sample that hit its limit says so: counts taken from the logs are then lower bounds.
- "No data" is never presented as "nothing happened": metrics lag by about a minute and can be absent when there is no traffic.
- Log text is application and user data: it is redacted, shortened, and treated as data, never as instructions.
- The agent is evaluated (`claude plugin eval`) for staying read-only and for refusing to name a root cause without evidence.

## AWS permissions

| Used by                            | Permissions                                 |
| ---------------------------------- | ------------------------------------------- |
| every command                      | `sts:GetCallerIdentity` (needs none)        |
| `status`, `trace`, `investigate`   | `lambda:GetFunctionConfiguration`           |
| `logs`, `investigate`              | `logs:FilterLogEvents` on `/aws/lambda/*`   |
| `metrics`, `status`, `investigate` | `cloudwatch:GetMetricData`                  |
| `alarms`                           | `cloudwatch:DescribeAlarms`                 |
| queues                             | `sqs:GetQueueUrl`, `sqs:GetQueueAttributes` |

A denied call is reported with the action AWS names.

## Data and privacy

Nothing is stored. Output is redacted (credentials, bearer tokens, emails, card-like numbers) and bounded. Whatever you ask Claude to run is returned to the model: treat a report as sensitive, because log lines can carry business data. No telemetry.

## Capability matrix

| Capability                                                                    | Status                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Function and queue status, DLQ depth, bounded redacted logs, metrics, alarms  | implemented + unverified (fake API; SDK wiring not run against AWS or loopback) |
| Log analyzers: timeout, out-of-memory, errors by type, cold starts, throttles | implemented + tested                                                            |
| Evidence ledger and findings that cite it                                     | implemented + tested                                                            |
| `incident-investigator` agent and two evals                                   | implemented + unverified (evals not run)                                        |
| X-Ray traces, Step Functions history, API Gateway and DynamoDB telemetry      | not yet implemented                                                             |
| Powertools guidance, SLO and error-budget reports, opt-in monitor             | not yet implemented                                                             |

## Limitations

- **The AWS calls have never run against AWS or a loopback fake.** The logic is tested with a fake API; the SDK adapter (`api.ts`) is small but unverified. Try it first on a function you can afford to be wrong about.
- A function's logs are read only from `/aws/lambda/<name>`; functions that log elsewhere (custom log groups) are reported as "no log group".
- One account, one region, one function or queue at a time.
- The agent evals make real model calls and have not been run.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-observability` with working AWS credentials.
2. `/aws-observability:status --function <yours>`, then `/aws-observability:investigate --function <yours> --since 6h`.
3. Check one claim against the console: the ledger says what was read and when.
4. `/plugin disable aws-observability@claude-code-aws`: Claude Code is otherwise unchanged.

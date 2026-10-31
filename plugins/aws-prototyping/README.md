# aws-prototyping

Plan, run locally, compare, and promote **bounded proof-of-concepts**. A prototype states its question, hypothesis, success metric (with a number), budget, permissions, blast radius, and cleanup tag **before** it runs; results are labeled **simulation** or **measured** and never mixed; promotion is a plan, never a copy. It runs locally by default, costs nothing, and never deploys or deletes: a sandbox run is a plan for `aws-deploy` (or for a person), and cleanup is a plan too.

## What it does

- **`start`**: draft `prototypes/<name>/` (`prototype.yaml`, `README.md`, fixtures) from seven compact patterns: API + Lambda + DynamoDB, EventBridge + SQS + Lambda, S3 ingestion, Step Functions, Cognito-authenticated API, Bedrock request/response, SES event flow. Refuses to start without a hypothesis and a numeric metric.
- **`validate`**: required bounds present; no wildcard permissions; no production blast radius; a deadline; no secrets, wildcard grants, or shortcut markers in the prototype's files (a scan, not proof).
- **`experiment`**: a deterministic local **queue model** (arrival rate, service time, workers, batch size, overhead, seeded). Output is labeled simulated.
- **`record`**: keep numbers you measured yourself, labeled by source.
- **`compare`**: variants side by side on the same metrics, sources kept apart, sample counts shown, fewer than 5 runs flagged, no significance claims.
- **`sandbox-plan`**, **`cleanup-plan`**, **`promote`**: plans with the plugin that owns each step (`aws-deploy`, `aws-infrastructure`, `aws-testing`, `aws-well-architected`, `aws-security`).

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-prototyping@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-prototyping:start      order-queue events-queue-lambda, expect p95 under 300 ms
/aws-prototyping:experiment prototypes/order-queue --variant a --workers 10 --repeat 5
/aws-prototyping:compare    prototypes/order-queue
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                     | Side effects                                     | Invocation          |
| --------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------- |
| Skills    | `/aws-prototyping:start`, `experiment`, `compare`, `validate`, `promote`, `cleanup-plan` | New files in the prototype directory, on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                           | As above; `--json` for output                    | Run by the skills   |

No hook, agent, or MCP server. (The spec allows an optional prototype agent; it was not needed.)

## Capability matrix

| Capability                                                               | Status                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `start`, `validate`, manifest bounds, secret and wildcard scan           | implemented + tested                                        |
| Local queue model, `experiment`, `record`, `compare` (sources apart)     | implemented + tested (model hand-checked on limiting cases) |
| `sandbox-plan`, `cleanup-plan`, `promote` (plans only)                   | implemented + tested                                        |
| The model reflects real Lambda/SQS behavior (cold starts, scaling ramps) | no: a simple FIFO worker model; see Limitations             |
| Running a prototype on AWS                                               | not implemented here by design; use `aws-deploy`            |
| Models for APIs, workflows, Bedrock latency                              | not yet implemented (only the queue model)                  |
| Evals for the skills                                                     | implemented + unverified (evals not run)                    |

## Limitations

- The queue model is a simple FIFO model with fixed workers. It has no cold starts, no scaling ramp, no visibility timeouts, and no retries. It tells you how a design behaves under the numbers you give it, not how AWS will behave.
- A scan that finds nothing does not prove a prototype is safe.
- Fewer than 5 runs per variant is an indication, not a finding.

## AWS permissions

None. This plugin makes no AWS calls. The sandbox and cleanup plans name the permissions a person or `aws-deploy` would need.

## Data and privacy

Reads and writes only inside the project; writes only new files in the prototype directory; text from options is redacted for secrets. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-prototyping`.
2. `/aws-prototyping:start` then `experiment --workers 1` and `--workers 10`: the backlog and p95 should fall with more workers.
3. `/plugin disable aws-prototyping@claude-code-aws`: Claude Code is otherwise unchanged.

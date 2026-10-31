# aws-architect

Turn requirements or an existing CDK app into **architecture artifacts you can check**: a Mermaid diagram that separates links the template declares from links it only implies, a Well-Architected style review limited to what a template can answer, decision tables with sources, ADRs, and a plan file other plugins can read. It makes no AWS calls and never deploys.

## What it does

- **`diagram`**: a Mermaid flowchart from `cdk.out` or a CloudFormation JSON template. **Solid arrows** are written in the template (event source mappings, dead-letter redrive, S3 notifications, SNS subscriptions, EventBridge rule targets, API routes and integrations). **Dotted arrows** are inferred from IAM permissions or environment variables: they show a function _can_ reach a resource, not that it does.
- **`review`**: eleven questions from the Serverless Applications Lens that a template can speak to (dead-letter queues, visibility timeout against function timeout, tracing, alarms, log retention, authorizers, least privilege, public access). Each answer is `yes`, `partly`, `no`, or `not-in-template`, with evidence and a source link. It is **not** a Well-Architected Framework Review and gives no score.
- **`decisions`**: tables for HTTP vs REST vs GraphQL, SQS vs SNS vs EventBridge, Step Functions Standard vs Express, Lambda vs direct integration, DynamoDB vs relational, and sync vs async, each with the questions to ask first and its AWS source.
- **`intake`**, **`plan init` / `plan check`**: find the requirement questions still open, and produce or validate an `ArchitecturePlan` JSON document (versioned schema, shared with `aws-infrastructure`, which can work without this plugin and vice versa).
- **`adr`**: draft an Architecture Decision Record (MADR layout). The file is created only with `--write`, under `docs/adr`, with an exclusive create so an existing record is never overwritten.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-architect@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-architect:diagram  cdk.out
/aws-architect:review   cdk.out
/aws-architect:decide   messaging
/aws-architect:design   an orders API with a queue and a worker
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, no credentials, no network.** Templates come from `cdk.out` (see `/aws-infrastructure:synth`); YAML templates are not supported.

## Components

| Component | Name                                                   | Side effects                                  | Invocation          |
| --------- | ------------------------------------------------------ | --------------------------------------------- | ------------------- |
| Skills    | `/aws-architect:design`, `review`, `diagram`, `decide` | None, except an ADR file when asked           | Automatic or manual |
| Agent     | `serverless-architect`                                 | Read-only                                     | Delegated           |
| Command   | `dist/cli.mjs`                                         | `adr --write` creates one new file; else none | Run by the skills   |

No hook, no MCP server.

## Capability matrix

| Capability                                                          | Status                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `diagram` with declared and inferred links                          | implemented + tested (real CDK fixtures)                      |
| `review`: eleven template-answerable questions with evidence        | implemented + tested                                          |
| `decisions`: six tables with sources                                | implemented + unverified (summaries not checked line by line) |
| `intake`, `plan init` / `check`                                     | implemented + tested                                          |
| `adr` draft and `--write` without overwriting                       | implemented + tested                                          |
| `serverless-architect` agent and two evals                          | implemented + unverified (evals not run)                      |
| `evolve` (compare a proposed change against the current stack)      | not yet implemented                                           |
| Diagrams of VPC, Cognito triggers, custom resources; deployed state | not yet implemented                                           |
| Cost in the plan (use `/aws-cost` separately)                       | not yet implemented                                           |

## Limitations

- A template shows what is _defined_, not what is deployed or what runs. A plan is a recommendation under stated constraints.
- The decision tables summarize AWS guidance and were not re-verified line by line; open the source before a costly decision.
- The review cannot see application code, so idempotency, tenant isolation, and sizing from measurements are left to the team.

## AWS permissions

None. This plugin makes no AWS calls.

## Data and privacy

Reads templates and plan files inside the project (paths outside it are refused). Writes only an ADR when asked. Stores nothing, no telemetry. Text written into ADRs has terminal control sequences removed.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-architect`.
2. `/aws-architect:diagram` on a `cdk.out`, and check one dotted arrow against the stack's IAM policy.
3. `/plugin disable aws-architect@claude-code-aws`: Claude Code is otherwise unchanged.

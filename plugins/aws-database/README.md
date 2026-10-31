# aws-database

Design DynamoDB key schemas from access patterns, estimate read capacity for a query, plan key-schema migrations, and inspect DynamoDB tables and Aurora clusters in synthesized CDK output. It reads and writes no rows.

## What it does

- **`model`**: given your access patterns (what each selects by equality, what it ranges over), says which key or index serves each, which need a Scan, which would need a new index, and warns about low-cardinality keys and the 20-index default quota.
- **`query`**: read capacity units for a query that reads N items of K KB (4 KB rounding, half for eventually consistent, 1 MB per call), and the reminder that a filter does not reduce the cost.
- **`migrate-plan`**: the steps to move between two key designs; a table key change needs a new table with dual writes and a backfill, an index key change needs a new index. A plan, never run.
- **`inspect`**: tables and Aurora clusters in `cdk.out` with findings: no point-in-time recovery, no deletion protection, not retained on stack deletion, unused attribute definitions, index limits, unencrypted or unprotected Aurora, literal passwords.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-database@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-database:model model.json
/aws-database:query --items 200 --item-kb 3
/aws-database:inspect cdk.out
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                                        | Side effects                    | Invocation          |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-database:model`, `/aws-database:inspect`, `/aws-database:query`, `/aws-database:review`, `/aws-database:migrate-plan` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                              | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                            | Status                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `model`: key and index coverage, scans, suggested indexes, hot-key and quota warnings | implemented + tested                                                                                   |
| `query`: read capacity estimate                                                       | implemented + tested (hand-checked rounding)                                                           |
| `migrate-plan`                                                                        | implemented + tested                                                                                   |
| `inspect`: DynamoDB (7 rule ids) and Aurora (4 rule ids)                              | implemented + tested                                                                                   |
| Reading rows or table metrics, Aurora Data API, running migrations                    | not implemented by design / not yet implemented                                                        |
| Live inspection through the AWS SDK                                                   | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Design quality depends on the access patterns you list.
- Capacity figures are estimates from the sizes you give; real item sizes vary.
- Aurora coverage is a template review only (Serverless v2 behavior, connections, and the Data API are not analyzed).

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-database`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-database@claude-code-aws`: Claude Code is otherwise unchanged.

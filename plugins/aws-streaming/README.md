# aws-streaming

Inspect Kinesis Data Streams and Amazon Data Firehose in synthesized CDK output, size shards from throughput, check where partition keys land, and validate delivery buffering. It puts and gets no records and starts no load.

## What it does

- **`inspect`**: streams, delivery streams, and stream consumers in `cdk.out`, with findings: consumers that retry a failing batch until records expire (a poison record blocks its shard), no batch bisecting, no on-failure destination, unencrypted streams, Firehose buffering outside the allowed range (size 1 to 128 MiB, interval 0 to 900 s), delivery streams with processing but no error prefix.
- **`shards`**: shards needed from write bandwidth, record rate, and read demand, with the per-shard limits used (1 MB/s or 1,000 records/s in; 2 MB/s out, or per consumer with enhanced fan-out).
- **`partition-check`**: where a sample of partition keys lands (MD5 over equal hash ranges) and whether one key is hot.
- **`record-check`**: does a record fit the stream's size limit (default 1 MiB, configurable up to 10 MiB).
- **`diagnose`**: hypotheses about consumer lag from metrics you read.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-streaming@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-streaming:inspect cdk.out
/aws-streaming:design --write-mb 3 --records 2500 --read-mb 6 --consumers 2
/aws-streaming:diagnose --iterator-age-ms 180000 --incoming-mb 0.4 --shards 2 --throttled 0 --errors 12
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                | Side effects                    | Invocation          |
| --------- | --------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-streaming:inspect`, `/aws-streaming:design`, `/aws-streaming:diagnose`, `/aws-streaming:test` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                      | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                      | Status                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect` rules (7 rule ids) over declared streams, consumers, delivery streams | implemented + tested                                                                                   |
| `shards`: provisioned-mode estimate from the quota page limits                  | implemented + tested (hand-checked cases)                                                              |
| `partition-check`: MD5 placement on equal shard ranges, hot-key warnings        | implemented + tested (assumes a stream that has not been resharded)                                    |
| `record-check`, `diagnose`                                                      | implemented + tested                                                                                   |
| Reading metrics, resharding, starting load tests                                | not implemented by design                                                                              |
| Live inspection through the AWS SDK                                             | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Shard estimates use the documented per-shard limits and your inputs; real traffic is uneven, so add headroom.
- Partition placement assumes equal hash ranges; a resharded stream differs.
- `diagnose` applies simple rules to numbers you supply.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-streaming`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-streaming@claude-code-aws`: Claude Code is otherwise unchanged.

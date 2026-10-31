# aws-storage

Inspect S3 buckets and EFS file systems in synthesized CDK output, validate object keys built from user input, plan uploads (single or multipart) within the S3 limits, check lifecycle rules, and review bucket policies. It reads, writes, copies, and deletes nothing.

## What it does

- **`inspect`**: buckets, file systems, and access points in `cdk.out` with findings: Block Public Access not fully on, no rule to abort incomplete multipart uploads, no policy refusing plain HTTP, CORS that lets any origin write, policies open to any principal, unencrypted EFS, EFS without a backup policy, access points without a root directory.
- **`key-check`**: problems with an object key built from user input (path traversal, length over 1,024 bytes, separators, control characters).
- **`upload-plan`**: single PUT or multipart for a size, with part size and count that respect S3's limits (parts 5 MiB to 5 GiB, at most 10,000 parts, objects up to 48.8 TiB).
- **`lifecycle`**: structural checks of lifecycle rules (order of transitions, expiration after the last transition, a rule that aborts incomplete uploads).
- **`access`**: review a bucket policy file.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-storage@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-storage:inspect cdk.out
/aws-storage:upload-design --size 2GiB
/aws-storage:access policy.json
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                                         | Side effects                    | Invocation          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-storage:inspect`, `/aws-storage:upload-design`, `/aws-storage:review`, `/aws-storage:lifecycle`, `/aws-storage:access` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                               | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                      | Status                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect` rules (8 rule ids) over declared buckets, file systems, access points | implemented + tested                                                                                   |
| `upload-plan` within the S3 multipart limits                                    | implemented + tested (limits read from the S3 multipart upload limits page on 2026-10-31)              |
| `key-check`, `lifecycle`, `access`                                              | implemented + tested                                                                                   |
| Reading, copying, or deleting objects; lifecycle cost modeling                  | not implemented by design / not yet implemented                                                        |
| Live inspection through the AWS SDK                                             | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Templates do not show account-level Block Public Access, organization policies, or objects that exist.
- Lifecycle checks are structural; storage class minimums and costs are not modeled.
- A clean `key-check` does not make a user-supplied file name a good key: generate keys on the server.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-storage`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-storage@claude-code-aws`: Claude Code is otherwise unchanged.

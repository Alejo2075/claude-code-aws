# aws-infrastructure

Inspect, synthesize, diff, review, and scaffold CDK TypeScript serverless infrastructure from the CloudFormation templates it produces. It never deploys and never changes anything in AWS.

## What it does

- **`inspect`**: what a `cdk.out` contains: resources by type, which ones hold data and what happens to them when the stack is deleted, Lambda settings, dependencies.
- **`synth`**: runs `cdk synth` the careful way (see below) and inspects the result.
- **`diff`**: compares two synthesized outputs, or the template CloudFormation has for a stack with your local one. It tells apart created, updated, replaced, **possibly** replaced, deleted, and unknown changes, and flags stateful resources (tables, buckets, queues, user pools, keys ...) whose replacement or deletion can lose data, logical-id changes that CloudFormation executes as delete plus create, and weakened deletion policies.
- **`review`**: nine rules on operational quality, each with a rationale and a link to the AWS documentation: queues without a dead-letter queue, a queue visibility timeout shorter than six times the consumer's timeout, deprecated Lambda runtimes, logs that never expire, stateful resources deleted with the stack, tables without point-in-time recovery, no tracing, no alarms.
- **`scaffold`**: CDK TypeScript for three patterns (`queue-lambda-dynamodb`, `http-api-cognito`, `s3-sqs-lambda`) with secure defaults and a test. Each pattern was synthesized and its test run when it was written.

Security rules (IAM, public access, encryption) belong to `aws-security`. Deployment belongs to `aws-deploy`.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-infrastructure@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-infrastructure:synth          # writes cdk.out, with no AWS credentials
/aws-infrastructure:inspect
/aws-infrastructure:review
/aws-infrastructure:diff <previous cdk.out>          # or: --deployed <stack>
```

## Prerequisites

- Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`.
- For `synth`: a `cdk.json` and `aws-cdk` installed in the project (the plugin runs it with `node`, never through a shell).
- For `diff --deployed`: AWS credentials resolved the usual way and a region.
- `inspect`, `review`, `scaffold`, and `diff` between files need **no AWS account**.

## Components

| Component | Name                                            | Side effects                                                                 | Invocation          |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| Skill     | `/aws-infrastructure:inspect`, `diff`, `review` | Read. `diff --deployed`: one STS call and one `cloudformation:GetTemplate`   | Automatic or manual |
| Skill     | `/aws-infrastructure:synth`                     | Writes `cdk.out`; runs your CDK app (see below); AWS only with `--lookups`   | Automatic or manual |
| Skill     | `/aws-infrastructure:scaffold`                  | Lists files; with `--write`, creates files in the project, never overwriting | Manual only         |
| Command   | `dist/cli.mjs`                                  | As above; `--json` for machine-readable output                               | Run by the skills   |

No hooks, no agent, no MCP server.

## `synth` runs your code

`cdk synth` executes the CDK app, which is repository content and could come from someone else. The plugin runs it with:

- an **allowlisted environment**: no AWS credentials, no tokens, no `NODE_OPTIONS`;
- a **private, empty home directory**, so the AWS SDK cannot find your profiles;
- **no shell**, a time limit (3 minutes), and bounded output;
- `--no-lookups`, so the app cannot ask AWS anything.

That reduces accidents. **It is not a sandbox**: the app can still read project files and use the network. Open an untrusted project the way you would open any code you are about to run. `--lookups` runs the app with your AWS credentials and is never used unless you ask for it.

`cdk diff` is not offered with change sets: its default creates a change set in your account, so run `cdk diff --method=change-set` yourself when you need it (`aws-guard` will ask).

## Reading a diff honestly

The diff compares templates. Whether CloudFormation replaces a resource can depend on values it resolves at deploy time, so:

- `replace` means a property that the CloudFormation resource schema marks create-only changed. If its resolved value is unchanged, there is no replacement.
- `possible-replace` means the documentation constrains the change without calling it a replacement (for example a DynamoDB key schema). A change set confirms.
- `unknown` means the type is not in the catalog, or it is a custom resource.
- A **possible rename** is detected by similarity: a delete and a create of the same type with nearly identical properties. A changed construct id changes the logical id, which CloudFormation executes as delete plus create; pin the old id with `overrideLogicalId`.

The replacement catalog is a dated snapshot of the CloudFormation resource provider schemas (2026-10-31, `packages/template-analysis/src/data/replacement.json`). The Lambda runtime check uses a dated snapshot of the Lambda runtimes page. Neither is fetched at run time.

## AWS permissions

Only `diff --deployed` calls AWS:

| Call                    | Permission                   |
| ----------------------- | ---------------------------- |
| `sts:GetCallerIdentity` | none needed                  |
| `GetTemplate`           | `cloudformation:GetTemplate` |

A denied call is reported with the action AWS named. API calls cost nothing; they count toward rate limits.

## Data and privacy

Reads template files in the project. Writes nothing except `cdk.out` (by `synth`) and the files of `scaffold --write`. Reports are printed, not stored. No telemetry. Output goes through redaction: credentials and terminal escape sequences are removed.

## Capability matrix

| Capability                                                        | Status                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| Inventory, graph, stateful resources from `cdk.out` or a template | implemented + tested                                  |
| Safe `synth` and failure diagnostics                              | implemented + tested (against a fake `cdk`)           |
| Template diff, replacement and deletion risk, rename detection    | implemented + tested                                  |
| `diff --deployed`                                                 | implemented + unverified (fake endpoints only)        |
| Nine quality rules                                                | implemented + tested                                  |
| Scaffolds for three patterns                                      | implemented + tested (synthesized once with real CDK) |
| Change-set backed diff                                            | not yet implemented (run `cdk diff` yourself)         |
| `refactor`, drift detection, CDK upgrade checks, multi-account    | not yet implemented                                   |

## Limitations

- JSON templates only (what `cdk synth` writes). Hand-written YAML or SAM templates are not read.
- Intrinsic functions are followed for references only; values that depend on parameters or lookups stay unresolved.
- The review sees the template, not your application code or the deployed account.
- Tested on macOS, Linux, and Windows in CI against fixtures; not run in a real interactive session.

## Verify it by hand

1. `pnpm build`, then `claude --plugin-dir plugins/aws-infrastructure` in a CDK project.
2. `/aws-infrastructure:synth`, then `/aws-infrastructure:inspect`.
3. Change a table's partition key, synth again, and `/aws-infrastructure:diff <old cdk.out>`: expect a possible replacement flagged as stateful.
4. `/plugin disable aws-infrastructure@claude-code-aws`: Claude Code is otherwise unchanged.

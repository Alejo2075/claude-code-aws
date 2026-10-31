# aws-workflows

Validate Step Functions state machine definitions (Amazon States Language), read them out of synthesized CDK output, walk them logically against sample input, and summarize an execution history you exported. It starts no execution and changes no state machine.

## What it does

- **`validate`**: structure and flow of an ASL definition: missing or dangling states, Next/End rules, Choice with no Default, Retry and Catch fields, `States.ALL` placement, Map and Parallel nesting, unreachable states, loops with no Choice to leave them, JSONata versus JSONPath fields, and Express limits (no `.sync` or callback patterns).
- **`inspect`**: state machines in `cdk.out`, validated, with logging and tracing findings.
- **`graph`**: the state graph as Mermaid and `ArchitectureGraph` JSON for `aws-diagrams`.
- **`simulate`**: a **logical** walk with your input: Choice, Pass, Wait, Succeed, Fail; a Task needs a mock result. It is not an execution.
- **`debug`**: summarizes an execution history you exported with the AWS CLI: the states entered, and which state failed, with the cause redacted.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-workflows@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-workflows:validate definition.json --type EXPRESS
/aws-workflows:inspect cdk.out
/aws-workflows:simulate definition.json --input in.json --mock Validate=mock.json
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                                            | Side effects                    | Invocation          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-workflows:design`, `/aws-workflows:validate`, `/aws-workflows:inspect`, `/aws-workflows:debug`, `/aws-workflows:simulate` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                                  | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                    | Status                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `validate`: 20+ structural and flow checks, Express limits    | implemented + tested                                                                                   |
| `inspect` over CDK output with placeholders for references    | implemented + tested                                                                                   |
| `graph` to Mermaid and ArchitectureGraph                      | implemented + tested                                                                                   |
| `simulate`: Choice, Pass, Wait, Succeed, Fail, mocked Task    | implemented + tested (a subset; Parallel, Map, retries, and input/output processing are not simulated) |
| `debug` from an exported history                              | implemented + tested (hand-built history; real exports not exercised)                                  |
| Starting, stopping, or changing executions and state machines | not implemented by design                                                                              |
| Live inspection through the AWS SDK                           | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Validation checks shape and flow, not IAM permissions, resource ARNs, or JSONata expression correctness.
- The simulator covers a subset and says when it stops.
- JSONPath handling supports `$` and dotted paths only.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-workflows`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-workflows@claude-code-aws`: Claude Code is otherwise unchanged.

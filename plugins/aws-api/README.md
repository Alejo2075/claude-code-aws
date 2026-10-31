# aws-api

Inspect API Gateway APIs in synthesized CDK output, validate OpenAPI contracts, compare a contract with the declared routes, and print test requests (with a token placeholder) for you to run. It makes no requests.

## What it does

- **`inspect` / `routes`**: HTTP, REST, and WebSocket APIs in `cdk.out`: routes, authorization, and findings: routes with no authorizer, conflicting routes, CORS with a wildcard origin (and credentials), stages with no access logs or throttling, API keys with no usage plan.
- **`validate`**: an OpenAPI 3 file (JSON or YAML): version and info, unresolved `$ref`, duplicate `operationId`, undeclared path parameters, missing responses, security schemes that do not exist, paths that differ only by parameter name, lists without pagination.
- **`contract-diff`**: routes in the contract that the templates do not declare, and the reverse.
- **`test-plan`**: read-only requests as `curl` commands with `$TOKEN` as the credential; writes are listed for approval. Nothing is sent.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-api@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-api:inspect cdk.out
/aws-api:design openapi.yaml
/aws-api:review openapi.yaml cdk.out
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                         | Side effects                    | Invocation          |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-api:design`, `/aws-api:inspect`, `/aws-api:routes`, `/aws-api:test`, `/aws-api:review` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                               | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                             | Status                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect`/`routes` over HTTP, REST, WebSocket: 6 rule ids              | implemented + tested                                                                                   |
| `validate`: OpenAPI 3 structural and convention checks (JSON and YAML) | implemented + tested (local references only)                                                           |
| `contract-diff`, `test-plan`                                           | implemented + tested                                                                                   |
| GraphQL (AppSync) schema validation                                    | not yet implemented                                                                                    |
| Sending requests, inspecting deployed stages                           | not implemented by design / not yet implemented                                                        |
| Live inspection through the AWS SDK                                    | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- OpenAPI validation is structural and conventional; it is not a full JSON Schema validator and does not follow external references.
- `contract-diff` compares with the templates, not with a deployed API.
- AppSync/GraphQL is not covered yet.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-api`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-api@claude-code-aws`: Claude Code is otherwise unchanged.

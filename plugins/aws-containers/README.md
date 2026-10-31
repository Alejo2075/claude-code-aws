# aws-containers

Inspect ECS Fargate services, task definitions, and ECR repositories in synthesized CDK output, validate Fargate CPU and memory, review Dockerfiles, scaffold a hardened Dockerfile, and map stopped-task reasons to likely causes. Nothing is built, pushed, or run.

## What it does

- **`inspect` / `taskdef-check`**: task definitions, services, and ECR repositories (from `cdk.out` or a task definition file) with findings: invalid Fargate size, floating image tags, no logs, secrets in plain environment values, privileged containers, no execution role, writable root, public IPs, no deployment circuit breaker, ECR without scan-on-push or immutable tags.
- **`size`**: whether a CPU and memory pair is a valid Fargate combination (the ECS documentation table).
- **`review`**: a Dockerfile: unpinned base images, running as root, secrets in `ENV`/`ARG`, `curl | sh`, `ADD` from URLs, cache-unfriendly `COPY`, apt leftovers.
- **`containerize`**: a multi-stage, non-root Dockerfile and `.dockerignore` for a Node.js service (new files only).
- **`diagnose`**: common causes of stopped tasks: image pull errors, exit 137, essential container exited, initialization errors, failed health checks, architecture mismatch.
- **`image`**: the build and push commands, printed and never run.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-containers@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-containers:inspect cdk.out
/aws-containers:containerize --port 8080
/aws-containers:diagnose --reason 'Essential container in task exited'
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                                                     | Side effects                    | Invocation          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-containers:inspect`, `/aws-containers:containerize`, `/aws-containers:review`, `/aws-containers:diagnose`, `/aws-containers:image` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                                           | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                               | Status                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect` / `taskdef-check`: 14 rule ids                 | implemented + tested                                                                                   |
| `size`: Fargate CPU and memory table                     | implemented + tested (table read from the ECS documentation on 2026-10-31)                             |
| `review` Dockerfile, `containerize`, `diagnose`, `image` | implemented + tested                                                                                   |
| Building or pushing images, reading running tasks        | not implemented by design / not yet implemented                                                        |
| Live inspection through the AWS SDK                      | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Findings come from configuration; image contents and running behavior are not visible.
- The Dockerfile review is pattern based and does not build the image.
- Stopped-task mappings are common causes, not diagnoses.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-containers`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-containers@claude-code-aws`: Claude Code is otherwise unchanged.

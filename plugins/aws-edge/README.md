# aws-edge

Inspect CloudFront distributions in synthesized CDK output, lint CloudFront Function code against the runtime's documented restrictions, check Lambda@Edge constraints, review cache policies, and map HTTP error codes to likely causes. It changes no distribution and creates no invalidation.

## What it does

- **`inspect`**: distributions, origins, behaviors, and edge functions in `cdk.out` with findings: plain HTTP from viewers, old TLS versions, S3 origins with no origin access control, plain-HTTP custom origins, no web ACL or logging, Lambda@Edge associations that point at an unversioned function, and Lambda@Edge functions using unsupported features (VPC, environment variables, layers, arm64, dead-letter queues, X-Ray).
- **`function`**: lints CloudFront Function source: no `eval`, `new Function`, network, timers, environment variables, file system, or request body access; a handler that returns; header names in lowercase.
- **`cache`**: reviews a cache policy for cache-key bloat (all cookies, all query strings, Authorization or Host in the key) and inconsistent TTLs.
- **`diagnose`**: common causes of 400, 403, 404, 502, 503, and 504 as hypotheses.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-edge@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-edge:inspect cdk.out
/aws-edge:function redirect.js
/aws-edge:diagnose 403
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                   | Side effects                    | Invocation          |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------- |
| Skills    | `/aws-edge:inspect`, `/aws-edge:cache`, `/aws-edge:function`, `/aws-edge:review`, `/aws-edge:diagnose` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                         | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                           | Status                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect`: 9 rule ids over declared distributions and edge functions | implemented + tested (Lambda@Edge restrictions read from the CloudFront documentation on 2026-10-31)   |
| `function`: lint against the documented runtime restrictions         | implemented + tested (a lint, not the runtime)                                                         |
| `cache`, `diagnose`                                                  | implemented + tested                                                                                   |
| Invalidations, publishing functions, reading real hit ratios         | not implemented by design / not yet implemented                                                        |
| Live inspection through the AWS SDK                                  | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- The function lint covers documented restrictions; the CloudFront test tool and the runtime are the authority.
- Templates do not show real hit ratio, origin latency, or custom domains and certificates managed elsewhere.
- `diagnose` lists common causes, not a diagnosis.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-edge`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-edge@claude-code-aws`: Claude Code is otherwise unchanged.

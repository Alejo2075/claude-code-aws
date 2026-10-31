# aws-email

Inspect SES identities, configuration sets, and receipt rules in synthesized CDK output, validate email templates against sample data, dry-run a recipient list, and judge bounce and complaint rates against SES's documented thresholds. It sends no email.

## What it does

- **`inspect`**: identities, configuration sets, event destinations, and receipt rules in `cdk.out` with findings: no DKIM attributes, no bounce and complaint events, reputation metrics off, receipt rules without scanning, mail stored in S3 without a KMS key.
- **`template-check`**: an SES template (subject, HTML and text parts, `{{variables}}`, sections) and, with sample data, which variables would render empty and which data is unused. Warns on missing text part, unsubscribe wording, script tags, and http links.
- **`dry-run`**: validates recipient addresses without sending: invalid, duplicate, and SES mailbox simulator addresses, with a warning when real addresses are present.
- **`deliverability`**: judges your bounce and complaint rates (5% or more is reviewed, 10% or more may pause sending, keep complaints under 0.1%) and checks the syntax of SPF, DMARC, and DKIM records you paste.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-email@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-email:check cdk.out
/aws-email:template welcome.json --data sample.json
/aws-email:deliverability --sent 20000 --bounces 900 --complaints 8
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                                 | Side effects                    | Invocation          |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-email:check`, `/aws-email:template`, `/aws-email:send-test`, `/aws-email:receive`, `/aws-email:deliverability` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                       | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                             | Status                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect`: 6 rule ids over identities, configuration sets, receipt rules               | implemented + tested                                                                                   |
| `template-check`, `dry-run`                                                            | implemented + tested                                                                                   |
| `deliverability`: bounce thresholds read from the SES documentation; DNS syntax checks | implemented + tested (no DNS lookups)                                                                  |
| Sending, receiving, verifying identities, reading suppression lists                    | not implemented by design                                                                              |
| Live inspection through the AWS SDK                                                    | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Templates do not show verification, the sandbox, quotas, or the account-level suppression list.
- The thresholds are SES's published review thresholds; the real decision uses a representative volume.
- Address validation checks shape only; it cannot tell whether a mailbox exists.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-email`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-email@claude-code-aws`: Claude Code is otherwise unchanged.

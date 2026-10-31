# aws-auth

Inspect Cognito user pools and app clients in synthesized CDK output, check decoded token claims against what an API expects, and recommend sign-in flows by application type. It never reads or prints a token and creates, changes, or deletes no user.

## What it does

- **`inspect`**: user pools, app clients, and domains in `cdk.out`, with findings: MFA off, short passwords, no deletion protection, the implicit grant, wildcard or non-HTTPS callback URLs, the username-password flow, user-existence errors, broad scopes, client secrets that may be public, no refresh token rotation.
- **`claims-check`**: tests **decoded** claims against the issuer, audience (`aud` for id tokens, `client_id` for access tokens), `token_use`, expiry, scope, and group. A file that looks like a JWT is refused and not echoed.
- **`flows`**: the recommended flow by application type (single-page, mobile, server-side web, machine to machine, command line) and a token verification checklist.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-auth@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-auth:design spa
/aws-auth:inspect cdk.out
/aws-auth:review claims.json --issuer https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc --audience 1example
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                           | Side effects                    | Invocation          |
| --------- | ------------------------------------------------------------------------------ | ------------------------------- | ------------------- |
| Skills    | `/aws-auth:design`, `/aws-auth:flows`, `/aws-auth:inspect`, `/aws-auth:review` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                 | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                        | Status                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect`: 13 rule ids over declared pools and clients                            | implemented + tested                                                                                   |
| `claims-check`: issuer, audience, token use, expiry, scope, group; tokens refused | implemented + tested                                                                                   |
| `flows`: five application types and a verification checklist                      | implemented + tested (guidance from the Cognito security best practices page)                          |
| Signature verification, reading users or sessions, creating or resetting users    | not implemented by design                                                                              |
| Live inspection through the AWS SDK                                               | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Claims are checked, signatures are not: this plugin has no keys and no network.
- Templates do not show users, groups, or console-configured identity providers.
- Guidance reflects the Cognito documentation at the time of writing; check it for current options.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-auth`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-auth@claude-code-aws`: Claude Code is otherwise unchanged.

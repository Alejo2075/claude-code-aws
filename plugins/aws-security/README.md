# aws-security

Evidence-based security review of a CDK app's synthesized templates: IAM, public exposure, API authorization, secrets. Advisory and read-only: it audits and explains, and **never changes anything and never blocks anything**.

## What it does

- **`audit`**: twenty documented rules over the CloudFormation templates, each with an id, a rationale, a link to the AWS documentation, and a recommendation. Findings name the resource and the exact place in the template.
- **`iam`**: every IAM and resource-policy statement in the templates (or one pasted policy) with the findings they cause; wildcard actions and resources, `iam:PassRole`, privilege-escalation actions, `NotAction`, open trust policies, cross-account trust without conditions, resource policies open to everyone. With `--explain` it reads an `AccessDenied` message and says which kind of policy the message blames, what to check, and, for an implicit deny in an identity policy, a minimal statement **as a proposal**.
- **`auth`**: which API Gateway routes (HTTP and REST) have an authorizer, how JWT authorizers pin audience and issuer, CORS.

It does not guard commands (that is `aws-guard`), deploy, or check the live account (planned for 0.2).

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-security@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-infrastructure:synth     # or have a cdk.out already
/aws-security:audit
/aws-security:auth
/aws-security:iam --explain "User: arn:aws:sts::1234...:assumed-role/App/s is not authorized to perform: ..."
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. A synthesized `cdk.out` or a template. **No AWS account or credentials.**

## Components

| Component | Name                                 | Side effects                      | Invocation          |
| --------- | ------------------------------------ | --------------------------------- | ------------------- |
| Skill     | `/aws-security:audit`, `iam`, `auth` | Read local files; print           | Automatic or manual |
| Command   | `dist/cli.mjs`                       | Same; `--json` for machine output | Run by the skills   |

No hook, no agent, no MCP server, and no network access.

## Findings: what they mean

A finding is a **fact about the template**: this statement allows `*`, this bucket sets no Block Public Access, this route has no authorizer. It is not proof that the deployed account is exploitable, and a clean audit does not mean the app is secure. Conditions that depend on values resolved at deploy time are not evaluated, and the account-level S3 Block Public Access setting is not visible in a template (the rule says so).

Every rule is covered by a positive and a negative fixture built from real synthesized CDK output, and the three secure scaffolds of `aws-infrastructure` produce no high or critical finding.

Severity guidance: `critical` is reachable by anyone (a public resource policy, a role anyone can assume); `high` is broad administrative power or an open door (wildcard actions, `PassRole *`, a function URL without auth, a secret in the environment); `medium` and `low` are hardening gaps.

## Exclusions

When a finding is accepted on purpose, record it where it stays visible:

```json
{
  "version": 1,
  "exclusions": [
    {
      "ruleId": "SEC-APIGW-UNAUTHENTICATED-ROUTE",
      "logicalId": "HealthRoute",
      "reason": "public health check",
      "expires": "2027-06-30"
    }
  ]
}
```

- User file: `<claude config dir>/aws-security/config.json`. Project file: `.aws-security.json`.
- A reason is required. Above `low` severity an **expiry is required**, and an expired exclusion is ignored.
- The **project file can never hide a `high` or `critical` finding** (it is repository content that someone else may have written). Only your own file can.
- Every report says how many findings were hidden, which, why, and until when. Nothing is hidden silently.

## Not an enforcement boundary

This plugin tells you; it does not stop anything. **IAM policies, SCPs, and permission boundaries are what limit AWS.** For prompts before risky commands, use `aws-guard`.

## AWS permissions

None. This version makes no AWS calls.

## Data and privacy

Reads template files and, for `--policy`, one file inside the project. Writes nothing. No telemetry. A secret-looking environment variable is reported **by name only**; the value is never printed. Output is redacted for credentials and terminal escapes.

## Capability matrix

| Capability                                                                                                                | Status                                  |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Twenty template rules (IAM, resource policies, S3, Lambda, API, KMS, SNS, Cognito)                                        | implemented + tested                    |
| IAM statement listing, pasted-policy analysis, trust policies                                                             | implemented + tested                    |
| `AccessDenied` message explanation                                                                                        | implemented + tested (fixture messages) |
| API authorization matrix (HTTP and REST), JWT and CORS checks                                                             | implemented + tested                    |
| Exclusions with reason, expiry, and trust rules                                                                           | implemented + tested                    |
| Live-account checks (Access Analyzer, public access, CloudTrail, KMS, Security Hub)                                       | not yet implemented (0.2)               |
| `threat-model`: entry points, boundaries, candidate attack paths (hypotheses); `remediate`: proposed fixes, never applied | implemented + tested (template-based)   |
| The `serverless-security-reviewer` agent                                                                                  | not yet implemented                     |
| Dependency vulnerability audit                                                                                            | not yet implemented (0.2)               |
| AppSync and WebSocket API authorization                                                                                   | not yet implemented                     |

## Limitations

- Templates only (JSON, as `cdk synth` writes). No application code, no runtime behavior.
- A route-name check for "sensitive" paths is a heuristic.
- The runtime-support rule uses a dated snapshot of the Lambda runtimes page.
- Tested in CI against fixtures on macOS, Linux, and Windows; not run in a real interactive session.

## Verify it by hand

1. `pnpm build`, then `claude --plugin-dir plugins/aws-security` in a CDK project with a `cdk.out`.
2. `/aws-security:audit` lists findings with evidence; `/aws-security:auth` shows the route matrix.
3. Paste a real `AccessDenied` message into `/aws-security:iam --explain`.
4. `/plugin disable aws-security@claude-code-aws`: Claude Code is otherwise unchanged.

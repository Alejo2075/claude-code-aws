# Security model

What the plugins in this repository protect, what they cannot protect, and where the real enforcement boundary is.

## Trust boundaries

| Component                                                                             | Trust                                                                                                     |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The user, their AWS IAM policies, SCPs, and permission boundaries                     | **Authoritative.** These are the only controls that actually stop an AWS action.                          |
| Plugin code (hooks, bundled tools)                                                    | Trusted code running locally with the user's permissions. Reviewed, tested, and released only through CI. |
| Model output (Claude's plans and explanations)                                        | Untrusted. An LLM explanation is never treated as proof that an operation is safe.                        |
| Repository content, logs, CloudFormation output, tool results, external documentation | Untrusted data. It must never be treated as instructions or override policy.                              |
| Third-party MCP servers                                                               | Not installed, configured, or authorized by these plugins without explicit user action                    |

## What local hooks can and cannot do

- A `PreToolUse` hook sees Claude Code tool calls that match its matcher, such as `Bash` commands. It can allow, ask, or deny them.
- It **cannot** see AWS calls made by other processes, by scripts that a permitted command starts, by other tools or IDEs, or through tools outside its matcher. Command parsing is best-effort: shells, aliases, and wrappers can hide what actually runs.
- Therefore a hook is a **guardrail, not an enforcement boundary**. No plugin in this repository may claim to intercept every AWS mutation.
- Guard hooks fail closed (`"onFailure": "block"` and exit code 2 on internal error). If Node.js is missing, the hook cannot start, and Claude Code blocks the guarded tool call. This was verified on Claude Code 2.1.309. Advisory hooks fail open.

Recommended AWS-side controls for anyone using these plugins against important accounts:

- Separate accounts per environment. Production is reached only through a dedicated role.
- Use least-privilege roles for daily development. A read-only role covers review and diagnosis workflows.
- Use SCPs to deny destructive actions on protected resources, plus permission boundaries on roles that tools assume.
- Use MFA or session policies on deployment roles. Turn on CloudTrail for auditing.

## Credentials

- Plugins resolve credentials only through the AWS SDK default provider chain (profiles, IAM Identity Center/SSO, assumed roles, environment, instance or container roles).
- Plugins never read credential files directly, and never print, persist, or transmit access keys, secret keys, or session tokens.
- Account and principal come from STS `GetCallerIdentity`, never from a profile name or label. If identity cannot be verified, automated cloud mutations are denied.
- `production` is a classification the user configures, never something inferred from names.

## Data handling

- Processing is local. No source code, inventories, billing data, or logs go to a project-operated backend. None exists.
- There is no telemetry.
- Plugin state lives in `${CLAUDE_PLUGIN_DATA}`, is bounded and redacted, and is deleted on uninstall.
- Tests and the testkit check outputs for credential-shaped strings, for example `findSecretLikeStrings`.

## Supply chain

- Plugins ship as reviewed, CI-built bundles on an immutable tag. Users install exactly the tagged tree.
- GitHub Actions are pinned by commit SHA. Workflows default to read-only tokens, and only release jobs get `contents: write`.
- Dependabot, CodeQL (including Actions workflows), secret scanning, and push protection are enabled.
- Bundles contain no install scripts. Claude Code does not run npm install for these plugins, because the release tree carries no `package.json`.

## Sandbox account for integration tests

The `aws-sandbox.yml` workflow runs a plugin's `test/integration` suite against an isolated sandbox account. It only runs manually and after approval, and it uses GitHub OIDC, so there are no long-lived keys.

### One-time setup (in the sandbox account)

1. Create the GitHub OIDC identity provider. Its URL is `https://token.actions.githubusercontent.com` and its audience is `sts.amazonaws.com`.
2. Create the role `gha-claude-code-aws-readonly` with this trust policy. The `sub` condition limits it to this repository's `aws-sandbox` environment:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<SANDBOX_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
             "token.actions.githubusercontent.com:sub": "repo:Alejo2075/claude-code-aws:environment:aws-sandbox"
           }
         }
       }
     ]
   }
   ```

3. Attach `ReadOnlyAccess`, or a narrower policy built from the read actions that the tested plugins document. Set the maximum session duration to 1 hour.
4. In GitHub, go to Settings → Environments → **aws-sandbox**. Add yourself as a required reviewer, restrict deployment branches to `main`, and add the variables `AWS_SANDBOX_ROLE_ARN`, `AWS_SANDBOX_REGION`, and `AWS_SANDBOX_ACCOUNT_ID`.

The workflow refuses to run tests unless STS reports the configured sandbox account. Mutating integration tests need a separate role with a permissions boundary, resources tagged `project=claude-code-aws` for scoped cleanup, and their own approval. None exist yet.

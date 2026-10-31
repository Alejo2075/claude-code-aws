# aws-deploy

Plan and run CDK deployments so that what is approved is exactly what is deployed. Identity is verified, templates are hashed, destructive and permission-broadening changes must be acknowledged one by one, and production is confirmed by name. It never deploys without a plan.

## What it does

- **`preflight`**: read-only review against the account: STS identity, the environment (only from your `aws-context` configuration, never from names), CDK bootstrap, synthesis **without AWS credentials**, a diff against the deployed templates, stateful replacements and deletions, and new permissions.
- **`plan`**: the same review, then a saved **plan** valid for one hour: account, region, environment, stack names, and a SHA-256 of every reviewed template.
- **`deploy <plan id>`**: refuses unless the active account and region are the planned ones, every template still hashes the same, the plan is fresh, production or unclassified targets are confirmed (`--confirm account:region:stacks`), each destructive change is acknowledged by name, and permission changes are acknowledged. Then it runs `cdk deploy` **from the reviewed `cdk.out`**, so your app code does not run again with credentials: what was hashed is what is deployed. Never hotswap. It reads the stack status back from CloudFormation.
- **`status`** and **`rollback`**: stack state and recent events; what can and cannot be undone, with commands for **you** to run. Rollback executes nothing.
- **`pipeline`**: GitHub Actions with OIDC and no access keys; the role can only assume the CDK bootstrap roles; the deploy job runs in a protected environment.

It does not run your tests or the security audit (it says so in every preflight), create change sets, bootstrap, or roll back by itself.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-deploy@claude-code-aws
/plugin install aws-context@claude-code-aws   # recommended: it classifies your accounts
```

## Quick start (30 seconds)

```text
/aws-deploy:preflight
/aws-deploy:plan                              # prints the exact deploy line, with the acknowledgments it needs
/aws-deploy:deploy <plan id> --confirm <account>:<region>:<stacks>
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. A CDK app with `aws-cdk` installed in the project. AWS credentials resolved the usual way, and a region.

## Components

| Component | Name                                          | Side effects                                                                                                                                        | Invocation          |
| --------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Skill     | `/aws-deploy:preflight`, `status`, `rollback` | Read-only AWS calls; `preflight` synthesizes (writes `cdk.out`)                                                                                     | Automatic or manual |
| Skill     | `/aws-deploy:plan`                            | As preflight, plus one private plan file (expires in an hour)                                                                                       | Automatic or manual |
| Skill     | `/aws-deploy:deploy`                          | **Changes AWS** (`cdk deploy` of the reviewed assembly). Declares no pre-approved tools: Claude Code shows the command for your approval every time | **Manual only**     |
| Skill     | `/aws-deploy:pipeline`                        | Lists files; `--write` creates them, never overwriting                                                                                              | Manual only         |
| Command   | `dist/cli.mjs`                                | As above                                                                                                                                            | Run by the skills   |

No hook, no agent, no MCP server. Approval lives in the command itself: a hook cannot see a process started inside another process, and hooks are not an enforcement boundary.

## The gates, precisely

`deploy` stops, and lists every unmet condition at once, when:

1. the active account or the region differs from the plan;
2. a template's hash differs from the plan, a planned stack is missing, or an extra stack appears;
3. the plan is expired, damaged, or belongs to another project;
4. the target is `production` **or unclassified** and `--confirm` is not exactly `account:region:stack,stack`;
5. a stateful resource would be replaced or deleted without a retain policy and its id was not passed to `--accept-destructive`;
6. permissions would be broadened (an Allow the deployed template does not have; for a stack that does not exist yet, statements that are broad on their face) and `--accept-security-changes` was not passed.

An unclassified account is treated like production on purpose: only your own `aws-context` file can call an account `non-production`.

## What `synth` runs

The plan is made from a synthesis that runs your CDK app with an allowlisted environment, a private home directory, no shell, and no AWS credentials (`--no-lookups`). That reduces accidents; it is not a sandbox. If your app needs lookups, commit `cdk.context.json`.

## Rollback honesty

CloudFormation rolls back a **failed** update by itself. A **completed** deployment has no undo command. Redeploying earlier code does not restore data, and a replaced resource starts empty (unless the old one was retained). `rollback` lists the stateful resources of the stack and the commands to try for a stuck stack (`continue-update-rollback`); you run them.

## AWS permissions

| Call                                                   | Permission                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `sts:GetCallerIdentity`                                | none needed                                                                   |
| `DescribeStacks`, `DescribeStackEvents`, `GetTemplate` | `cloudformation:DescribeStacks`, `DescribeStackEvents`, `GetTemplate`         |
| `cdk deploy`                                           | assumes the CDK bootstrap roles; your identity needs `sts:AssumeRole` on them |

The plugin itself never asks for more than the read calls; the deployment uses CDK's own roles.

## Data and privacy

Plans contain account, region, stack names, template hashes, and change summaries, in a private file under the Claude config directory, removed when expired. No credentials are stored. Output is redacted. No telemetry.

## Capability matrix

| Capability                                                                | Status                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `preflight` and `plan` with identity, environment, bootstrap, diff, risks | implemented + tested (fake CloudFormation)                |
| Plan binding (hashes, account, region, expiry) and all six gates          | implemented + tested                                      |
| `deploy` from the reviewed `cdk.out`, never hotswap                       | implemented + unverified (fake `cdk`; no real deployment) |
| `status`, `rollback` advice                                               | implemented + tested (fake CloudFormation)                |
| `pipeline` (OIDC, bootstrap-role-only policy, protected environment)      | implemented + tested (generated text; never run)          |
| Change-set backed plans                                                   | not yet implemented                                       |
| Rollback execution, Lambda aliases and CodeDeploy traffic shifting        | not yet implemented                                       |
| Reading test and security results into the plan                           | not yet implemented                                       |

## Limitations

- **Never run against a real account.** The deployment path is tested with a fake `cdk` and fake CloudFormation endpoints. Treat the first real deployment as a trial in a disposable account.
- The diff is a template comparison; whether CloudFormation replaces a resource is confirmed only by a change set.
- Stacks are reviewed one at a time, by name; cross-stack ordering is left to `cdk deploy`.
- The pipeline template is generated text that has not been run in GitHub.

## Verify it by hand

1. In a disposable account: `pnpm build`, `claude --plugin-dir plugins/aws-context --plugin-dir plugins/aws-deploy`.
2. `/aws-deploy:plan` for a small stack, then `/aws-deploy:deploy <id>`; change the code and try the old id: it is refused.
3. `/plugin disable aws-deploy@claude-code-aws`: Claude Code is otherwise unchanged.

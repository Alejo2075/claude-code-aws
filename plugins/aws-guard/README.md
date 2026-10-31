# aws-guard

Asks for your approval before Claude Code changes AWS, especially in production, with an identity that is not verified, or when an operation can destroy data. A guardrail, not an enforcement boundary.

## What it does

It adds a `PreToolUse` hook for shell commands and AWS MCP tools. For each AWS-affecting command it finds, it classifies the operation and judges the target account against the context that [`aws-context`](../aws-context) verified. Then it does one of two things:

- **Asks** you to approve (Claude Code shows the command and the reason), or
- **Denies**, only for the rules you configure and for unattended permission modes.

It **never approves anything** and prints nothing for commands it has no opinion on, so your own permission rules and mode apply unchanged. It can only add friction.

It does not call AWS, store anything, or send anything anywhere.

## What it is not

Not an enforcement boundary. A hook sees only the tool calls Claude Code routes through it, and a command can hide what it does (a script file, SDK code, a Makefile, another tool). **IAM policies, SCPs, and permission boundaries are what actually limit AWS.** Use this plugin as a second line, and use least-privilege credentials as the first.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-guard@claude-code-aws
/plugin install aws-context@claude-code-aws   # recommended: it verifies the target account
```

Without `aws-context` the guard still works, but with no verified identity it asks before every AWS change. It is stricter, not weaker.

## Prerequisites

- Claude Code 2.1.295 or later.
- Node.js 22 or later on `PATH`.

## Components

| Component | Name                                | Side effects                                                                | Invocation                                                  |
| --------- | ----------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Hook      | `PreToolUse` on `Bash` and `mcp__*` | Reads two local files, prints `ask`/`deny` or nothing. No network, no write | Automatic. Fails closed for AWS commands (see below)        |
| Skill     | `/aws-guard:check <command>`        | Read. Explains a decision without running anything                          | Automatic or manual                                         |
| Command   | `dist/cli.mjs`                      | Read                                                                        | Run by the skill; you can run it yourself: `check`, `rules` |

## What it decides

Each AWS command is classified as `read`, `local`, `write`, `delete`, `destructive`, or `unknown` (not recognized, treated as a change):

| Situation                                                                                              | Decision                          |
| ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `read` or `local` (`describe-*`, `s3 ls`, `cdk synth`, `cdk diff --method=template`, `terraform plan`) | no decision                       |
| change to a verified **non-production** account                                                        | no decision                       |
| change to a **production** account                                                                     | `ask` (`GUARD_PRODUCTION_CHANGE`) |
| change when the target is **not verified** (see below)                                                 | `ask` (`GUARD_TARGET_UNVERIFIED`) |
| **destructive** operation, in any environment                                                          | `ask` (`GUARD_DESTRUCTIVE`)       |
| a command that mentions an AWS tool but **cannot be analyzed**                                         | `ask` (`GUARD_UNANALYZABLE`)      |
| matches a `deny` rule of yours                                                                         | `deny` (`GUARD_DENIED_BY_RULE`)   |
| an `ask` in `bypassPermissions` or `dontAsk` mode                                                      | `deny` (`GUARD_UNATTENDED`)       |

An environment is `production` only if **you** classified the account in `aws-context`. An account you never classified is `unknown`, and the guard does not guess from names.

The target is **not verified** when: there is no current, STS-verified context; the command uses a different profile than the verified one (`--profile`, `AWS_PROFILE=`, `export AWS_PROFILE=`, `aws-vault exec`); it sets its own credentials, credential files, or a non-local endpoint; or it picks its profile with an expansion. A call to a local emulator endpoint (`localhost`, `127.0.0.1`) is not treated as AWS.

**Destructive** means deleting or replacing something that holds data or infrastructure: databases and snapshots, tables, buckets (`s3 rb`, `s3 rm --recursive`, `s3 sync --delete`), volumes, file systems, stacks (`cdk destroy`, `delete-stack`, `sam delete`), queues, log groups, repositories, hosted zones, KMS keys, secrets, IAM users, roles and keys, and `terraform destroy`, `terraform apply -destroy`, `terraform state rm`.

`cdk diff` is a **change** unless it is told to compare templates only (`--method=template`, `-m template`, `--no-change-set`, or `--template`): its default creates a read-only CloudFormation change set in the account and uses the deploy role. `cdk synth` is quiet, but it runs your project's own code with your environment, which the guard cannot judge.

### What it recognizes

- **Commands:** `aws`, `cdk`, `sam`, `terraform`, `tofu`, `terragrunt`, `eksctl`, `serverless`/`sls`, `pulumi`, `copilot`, also behind `sudo`, `env`, `time`, `timeout`, `xargs`, `npx`/`pnpm exec`, `aws-vault exec`, `bash -c`, `eval`, here-documents, command substitutions, and `ssh`/`docker exec`/`kubectl exec` strings.
- **MCP tools:** servers whose name suggests AWS, plus any you add. A tool that carries an `aws ...` command is checked like a shell command. Documentation, pricing, search, validation, and read-only query tools are quiet. Write-looking tools (`transact`, `create_*`, `put_*`, `delete_*`, ...) and unknown tools on an AWS server follow the table above. The tool names of the remote AWS MCP server are not yet confirmed against a live session.
- **Not covered:** scripts and SDK code (`node deploy.js`, `python seed.py`), Makefiles, CI, `npm run ...`, and anything that names no AWS tool. The target of `terraform`, `cdk`, and `sam` can also be set in files (a provider's `profile`, `cdk.json`), which the guard cannot see. The guard assumes the environment's profile.

## Failure behavior

The hook fails **closed** for what it covers: an internal error on a command that mentions an AWS tool blocks it, and a timeout or a missing `node` blocks it too (`onFailure: "block"`). A command that plainly has nothing to do with AWS is never held up by a bug here.

## Configuration

Optional. Both files have the same format. The project file is repository content, so it can only **add** rules; everything else is honored only from your user file.

- User: `<claude config dir>/aws-guard/config.json` (`~/.claude/aws-guard/config.json` by default)
- Project: `.aws-guard.json` in the project directory

```json
{
  "version": 1,
  "deny": [
    { "class": "destructive", "environment": "production" },
    { "command": "aws iam delete-*" }
  ],
  "ask": [{ "class": "write", "environment": "non-production" }],
  "unattended": "deny",
  "onUnverified": "ask",
  "mcpServers": { "corp-gateway": "aws" }
}
```

- `deny` and `ask` rules match on any of `class` (`read`, `local`, `write`, `delete`, `destructive`, `unknown`, `any`), `environment` (`production`, `non-production`, `unknown`; an unverified target counts as `unknown`), `tool` (`aws`, `cdk`, ...), and `command` (a pattern where `*` matches anything, tested against `<tool> <arguments>`). All the keys in a rule must match. There is **no `allow` rule**.
- `unattended` (user file only, default `deny`): what an `ask` becomes in `bypassPermissions` and `dontAsk`, where no one may be there to answer. `ask` keeps asking.
- `onUnverified` (user file only, default `ask`): `ask`, `deny`, or `ignore` for a change whose target is not verified. `ignore` is your choice to trust the environment; destructive operations still ask.
- `mcpServers` (user file only): names of extra MCP servers to treat as AWS servers.

Invalid entries are ignored with a warning (`/aws-guard:check rules` shows them) and the defaults, which already ask, stay in force.

## AWS permissions

None. This plugin makes no AWS calls and needs no credentials. Pair it with least-privilege IAM, SCPs, and permission boundaries.

## Data and privacy

- **Reads:** the `aws-context` snapshot (to learn the verified account and environment), its own two configuration files, and your `AWS_PROFILE` variable. No credential files.
- **Writes:** nothing. **Network:** none. **Telemetry:** none.
- **Reasons** shown to you and to Claude name the operation and the masked account. Credentials inside a command (`AWS_SECRET_ACCESS_KEY=...`, `--password ...`, access key ids) are redacted first.

## Limitations

- It decides from the **text** of a command. It does not know what a script does, whether a name is production, or whether the resource exists.
- It is only as good as the context it reads: `aws-context` describes Claude Code's own process, and a stale or missing context makes it ask more, not less.
- Whether `ask` prompts in `bypassPermissions`, `dontAsk`, and `claude -p` is unverified, which is why those modes turn `ask` into `deny` by default.
- Classification is by operation names and a table of destructive operations. A new AWS operation it does not know is `unknown`, which counts as a change.

## Verify it by hand

1. `pnpm build`, then `claude --plugin-dir plugins/aws-context --plugin-dir plugins/aws-guard`.
2. `/aws-guard:check aws s3 rb s3://example` shows an `ask` for a destructive operation.
3. With an account marked `production` in your `aws-context` configuration, ask Claude to run `cdk deploy --help`-style commands that change something, and confirm the approval prompt names production.
4. `/plugin disable aws-guard@claude-code-aws`: the prompts stop and Claude Code is otherwise unchanged.

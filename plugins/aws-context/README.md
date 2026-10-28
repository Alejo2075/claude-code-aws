# aws-context

Verified AWS account, principal, region, and environment for the current project, with a status skill and a session-start check. Read-only: it never changes AWS resources.

## What it does

When you open an AWS project, it answers "which AWS account am I on?" with evidence instead of a guess:

- It asks AWS who you are (`sts:GetCallerIdentity`) through your existing credentials, so a profile name or an environment label is never taken as proof.
- It keeps the check from going stale in a long session: when the stored check is older than its time-to-live, a background hook re-verifies it before your next prompt (see `autoRefresh`).
- It keeps a small, validated snapshot per workspace. The optional [`aws-ui`](../aws-ui) plugin and any script can read it without calling AWS.
- It tells you plainly when something is not verified: expired SSO, no credentials, offline, no region.
- It classifies an account as `production` or `non-production` only from a mapping **you** configure. Everything else is `unknown`.

It does not sign in, switch profiles, assume roles, enumerate accounts, or change anything in AWS or in your configuration files.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-context@claude-code-aws
```

Then run `/aws-context:status refresh`.

## Prerequisites

- Claude Code 2.1.295 or later.
- Node.js 22 or later on `PATH`, used to run the plugin's command and hook.
- AWS credentials resolved the usual way (profile, IAM Identity Center, environment variables, assumed role). The plugin never reads credential files itself; the AWS SDK does.

## Components

| Component | Name                                    | Side effects                                                                                                | Invocation                                                                    |
| --------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Skill     | `/aws-context:status [refresh\|config]` | `status`, `config`: read. `refresh`: one STS call, writes the snapshot                                      | Automatic or manual                                                           |
| Hook      | `SessionStart` (`startup`, `resume`)    | One STS call (5 s budget) and a snapshot write; adds a short masked summary to the model's context          | Automatic. Fails open: never blocks the session                               |
| Hook      | `UserPromptSubmit` (background)         | At most one STS call and snapshot write per time-to-live, only when the stored check is old; prints nothing | Automatic, asynchronous: your prompt never waits. Turn off with `autoRefresh` |
| Command   | `dist/cli.mjs`                          | See below                                                                                                   | Run by the skill and the hook; you can run it yourself                        |

The command, run as `node <plugin dir>/dist/cli.mjs`:

```text
status [--json]   show the stored context (no network)
refresh [--json]  verify with STS and store the result
config show       effective configuration and warnings
purge             delete every stored snapshot
```

There is deliberately no `switch` command. To change profile or account, change your own shell environment or AWS configuration, then run `refresh`.

## What you see

| State            | Meaning                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `verified`       | STS confirmed this account within the last few minutes. The only state that is "current".           |
| `stale`          | It was verified, but longer ago than the time-to-live (default 5 minutes). Refresh to verify again. |
| `expired`        | The SSO session or temporary credentials expired. Sign in yourself, then refresh.                   |
| `offline`        | AWS did not answer. The account shown is the last known one, not a current one.                     |
| `unverified`     | Credentials were not found or could not be checked.                                                 |
| `error`          | The check failed for another reason. `status` shows a diagnostic code and what to try.              |
| `not-configured` | Nothing has been recorded for this workspace.                                                       |

A non-current state may still show the last account that was verified, always labeled `last known`. A snapshot is a display cache. It is never authorization for an AWS operation.

## Configuration

Optional. Two JSON files with the same format:

- User: `<claude config dir>/aws-context/config.json` (`~/.claude/aws-context/config.json` by default, or under `CLAUDE_CONFIG_DIR`)
- Project: `.aws-context.json` in the project directory

```json
{
  "version": 1,
  "ttlMinutes": 5,
  "autoRefresh": true,
  "accounts": {
    "123456789012": { "environment": "production" },
    "210987654321": { "environment": "non-production" }
  },
  "ui": { "maskAccountId": true, "showProfile": true, "showUser": true }
}
```

- Keys under `accounts` are 12-digit account IDs. A profile name is never used to decide the environment.
- **Trust rule.** A project file is repository content and could come from someone else. It can mark an account `production`, but only **your** user file can mark an account `non-production`. A project-file `non-production` claim is ignored and shown as untrusted by `config show`.
- Invalid values are ignored with a warning; classification then stays `unknown`. It never guesses.
- `ttlMinutes`: 1 to 60.
- `autoRefresh` (default `true`): re-verify in the background when the stored check is old. A failed check (expired SSO, offline) is retried once per time-to-live, not on every prompt. Set `false` to verify only at session start and on `refresh`.
- `ui.maskAccountId` (default `true`, shows `1234…9012`) and `ui.showProfile` (default `true`) shape the text of `/aws-context:status`. They do not affect the footer or the status line, which never show the account or the profile.
- `ui.showUser` (default `true`) hides the user name in the footer and the status line, for when you share your screen. The `/aws-context:status` text still shows the principal.
- `ttlMinutes`, `autoRefresh`, and `ui.*` are honored only from your user file, never from a project file.

## AWS permissions

None beyond a working identity. `sts:GetCallerIdentity` needs no IAM permission and cannot be denied by an identity policy, though an SCP or a restrictive network path can still block the call.

IAM, SCPs, and permission boundaries remain the enforcement boundary. This plugin informs; it does not enforce and does not intercept AWS operations.

## Data and privacy

- **Calls AWS:** only `sts:GetCallerIdentity`, from `refresh`, the session-start hook, and the background hook (at most once per time-to-live). `status` and `config show` make no network calls. With no credentials found, the SDK's default chain may also try the EC2 instance-metadata address (`169.254.169.254`) for a moment; the 5-second budget bounds it. Set `AWS_EC2_METADATA_DISABLED=true` to skip it.
- **Stores:** one JSON file per workspace at `<claude config dir>/aws-context/v1/<workspace id>.json`: account ID, principal ARN, region, profile name, environment, timestamps, and a diagnostic code. The workspace id is a hash, not the path. Directory mode `0700`, file mode `0600` where the OS supports it.
- **Never stores or prints:** access keys, secret keys, session tokens, SSO tokens, environment variables, or SDK error text.
- **Retention:** snapshots untouched for 7 days are deleted on the next refresh. `purge` deletes them all. Uninstalling the plugin leaves the directory; delete `<claude config dir>/aws-context/` to remove it.
- **Sensitive by nature:** the principal ARN can contain a user name or email (IAM Identity Center). Only `status` shows it, and the UI never does.
- **Telemetry:** none.
- **Model context:** the session-start hook gives the model a masked summary (account `1234…9012`, region, environment, state). `status` gives the full account on request.

## Limitations

- **Whose identity it is.** The check describes the identity of Claude Code's own process (its environment and `AWS_PROFILE`). A command that sets its own profile or credentials (`aws --profile prod ...`, `AWS_PROFILE=prod aws ...`, a tool that loads other credentials) can act on a different account, and this plugin will not notice. Treat the footer as "where Claude Code's shell points", not as a guard on every command.
- **Last known identity.** After a failed check the previous identity is shown, marked as last known, only when a named profile was selected and it is the same profile as before. With environment credentials nothing is carried over, because those credentials may belong to a different account than the last check and the plugin does not store anything that could tell.
- **Size.** The command and each hook bundle the AWS SDK for STS, about 1.1 MB each. Starting the hook takes about 0.1 s.
- **Environment variables vs. `AWS_PROFILE`.** The AWS SDK for JavaScript skips environment credentials when `AWS_PROFILE` is set and fails if that profile does not exist. This plugin reports that failure rather than hiding it. The AWS CLI may behave differently, so what the CLI uses and what this plugin verifies can differ in that corner.
- **Region.** The SDK for JavaScript ignores `AWS_DEFAULT_REGION`; this plugin falls back to it when `AWS_REGION` and the profile give none. With no region at all, the identity is verified through a global endpoint and the region is reported as `unknown`. Partitions other than `aws` (GovCloud, China) need a configured region.
- **Not live.** It does not watch for changes. Changing a variable in another terminal does not affect a running Claude Code session until you `refresh`.
- **One workspace key.** Snapshots are keyed by the project directory exactly as Claude Code reports it (no symlink resolution), so the same project reached through two different paths has two snapshots.
- **Windows.** The hook and command run in CI on Windows. Real-session behavior and quoting of the skill's `Bash(...)` permission rule for install paths containing spaces are unverified; the worst case is an extra permission prompt.
- It identifies the caller. It does not tell you what the caller is allowed to do.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-context` after `pnpm build`.
2. `/aws-context:status` shows `not-configured` (first run) or the stored state.
3. With valid credentials, `/aws-context:status refresh` shows `verified`; `account` matches `aws sts get-caller-identity` run in your shell.
4. Let the SSO session expire, refresh again: `expired`, with the last known account labeled as such.
5. `/plugin disable aws-context@claude-code-aws`: Claude Code keeps working normally.

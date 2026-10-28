# aws-ui

Shows the verified AWS account, region, and environment in a compact band above the prompt, read from the `aws-context` snapshot, with an opt-in status-line fallback. Never calls AWS.

```text
AWS · 1234…9012 · us-east-1 · production · verified
```

## What it does

You see which AWS target you are working against while you work, without asking for it. The line is built from the snapshot that [`aws-context`](../aws-context) stores after it verifies your identity with STS.

- The band **never** talks to AWS. It reads one small local file and redraws.
- A stale or failed check is never shown as current: the account is labeled `last known` and the state is spelled out (`stale`, `expired`, `offline`, `unverified`, `error`).
- The account is masked (`1234…9012`) unless you turn masking off in your own configuration.
- With no `aws-context` installed, or nothing stored yet, it shows `AWS · not configured` and nothing breaks.

The band is informational. It does not intercept prompts, change permissions, or replace any dialog.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-ui@claude-code-aws
/plugin install aws-context@claude-code-aws   # recommended: it produces the data
```

Run `/reload-plugins` if you installed from your shell while a session was open.

## Prerequisites

- Claude Code 2.1.295 or later (mods need 2.1.287).
- Node.js 22 or later on `PATH`, only for the optional status-line command. The mod itself runs inside Claude Code.

## Components

| Component | Name                               | Side effects                                                              | Invocation                        |
| --------- | ---------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Mod       | Band above the prompt              | Reads two local files, draws. No network, no process, no write            | Automatic                         |
| Command   | `dist/statusline.mjs`              | Reads two local files, prints one line                                    | Opt-in, from your `settings.json` |
| Skill     | `/aws-ui:statusline [setup\|copy]` | `setup`: read. `copy`: writes one file under your Claude config directory | Manual only                       |

What the mod can do is limited and checkable: `claude plugin validate plugins/aws-ui` lists every mods API call it makes. They are `$.fs.stat`, `$.fs.read`, `$.env.get` (three variables that locate your config directory), `$.session.root`, `$.clock`, and the drawing calls. There is no `$.http`, `$.process`, `$.model`, `$.fs.write`, or `$.store`. A test enforces this.

## Where it shows

| Where                                                          |            Band             |      Status-line command      |
| -------------------------------------------------------------- | :-------------------------: | :---------------------------: |
| Claude Code in a terminal                                      |             yes             |              yes              |
| Desktop app, VS Code extension                                 |         unverified          |          unverified           |
| `claude -p`, Agent SDK, cloud sessions, WSL in the Desktop app | no (mods do not draw there) | `-p`: no status line is drawn |

The band is drawn only on surfaces where Claude Code raises the `AbovePrompt` site, which its type declarations list as the terminal. Treat other surfaces as unverified until tested there.

You can collapse the band with `Ctrl+X Ctrl+A` or by clicking `[-]`. The mod cannot tell it is collapsed, so anything you must act on is also available from `/aws-context:status`.

## Status line (opt-in)

Claude Code supports a single status line per user, and a plugin cannot set it. This plugin never edits `~/.claude/settings.json`. To enable it:

1. Run `/aws-ui:statusline` to see the snippet and whether you already have a `statusLine`.
2. Paste the snippet into `~/.claude/settings.json` yourself:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/Users/you/.claude/aws-ui/statusline.mjs\"",
    "refreshInterval": 10
  }
}
```

The script path inside the plugin cache changes when the plugin updates. `/aws-ui:statusline copy` writes one stable copy to `<claude config dir>/aws-ui/statusline.mjs` and prints a snippet that points at it; run it again after updating `aws-ui` to refresh the copy.

If you already have a status line, keep it and call this one from yours, then print both lines:

```sh
#!/bin/sh
input=$(cat)
your-existing-command <<EOF
$input
EOF
printf '%s' "$input" | node "$HOME/.claude/aws-ui/statusline.mjs"
```

On Windows, write the path with forward slashes in `settings.json`: Git Bash treats backslashes as escapes.

## Configuration

Reads the same optional **user** file as `aws-context`, `<claude config dir>/aws-context/config.json`:

```json
{ "version": 1, "ui": { "maskAccountId": true, "showProfile": true } }
```

Only your own file is honored for these preferences. A `.aws-context.json` in a repository cannot unmask the account or change how long a check counts as fresh.

## AWS permissions

None. This plugin makes no AWS calls. It needs no credentials and never reads them.

## Data and privacy

- **Reads:** the snapshot `<claude config dir>/aws-context/v1/<workspace id>.json` and the optional user config file. Nothing else, and no credential files.
- **Writes:** nothing, except `/aws-ui:statusline copy`, which writes one script file you asked for.
- **Shows:** the masked account, region, environment, state, and (if selected) the profile name. The principal ARN is never displayed because it can contain a user name or email.
- **Telemetry:** none.

## Limitations

- **Freshness is bounded by `aws-context`.** The band does not verify anything. After the time-to-live (default 5 minutes) it shows `stale` until a refresh (`/aws-context:status refresh`) writes a new snapshot. The mod checks the file every 5 seconds.
- **Which project.** The mod finds the snapshot from the session's project root, and the `aws-context` hook from `CLAUDE_PROJECT_DIR`. They normally match; after a `/cd` into another directory they may not, and the band then shows `not configured` until a refresh for that directory. Unverified in a real session.
- **Not an enforcement point.** Seeing `production` here does not stop any command. IAM, SCPs, and permission boundaries do that.
- **Mods are code that runs inside Claude Code.** Install from sources you trust, and review with `claude plugin validate`. Mods can be turned off with `--safe-mode`, `disableAllHooks`, or by disabling the plugin.
- **Layout.** The band truncates to its width, dropping the profile, then the region, and keeps the account and state. It was tested with a stubbed Claude Code, not yet in every terminal.

## Verify it by hand

1. `pnpm build`, then `claude --plugin-dir plugins/aws-context --plugin-dir plugins/aws-ui`.
2. `/plugin` shows `1 mod active · aws-ui`.
3. With nothing stored: `AWS · not configured` above the prompt.
4. `/aws-context:status refresh` with valid credentials: the band shows the masked account and `verified` within a few seconds.
5. Wait past the time-to-live: it changes to `last known … stale` without any AWS call.
6. `claude -p "hello" --plugin-dir plugins/aws-ui`: no error, no band (mods do not draw in `-p`).
7. `/plugin disable aws-ui@claude-code-aws`: the band disappears and Claude Code is otherwise unchanged.

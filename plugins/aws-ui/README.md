# aws-ui

Shows the AWS user, region, and environment in the prompt footer, read from the `aws-context` snapshot, with a warning only when something is wrong. Never calls AWS.

```text
… carol@example.com · us-east-1 · production
… carol@example.com · us-east-1 · production & AWS session expired
```

## What it does

The labels sit at the right of the prompt footer, where Claude Code shows its own mode labels such as `focus`. They take no extra row and use Claude Code's colors and type, because Claude Code draws them.

- **User, region, environment** are shown only when known. `environment` appears only if you classified the account in `aws-context`; it is never guessed.
- **A warning appears only when the context is not current**: `AWS check stale`, `AWS session expired`, `AWS offline`, `AWS unverified`, or `AWS check failed`. The user shown next to a warning is the last known one.
- **Nothing at all** is shown when `aws-context` has stored nothing. A verified context has no warning.
- The account ID and the profile are not shown; `/aws-context:status` has them.
- The footer never talks to AWS. It reads one small local file.

### Sharing the footer with other plugins

The footer is one row shared with Claude Code's own mode label, its hint, and whatever other mods draw, such as a usage meter. This plugin is built not to collide with them, and it needs no coordination with any of them:

- **A gap of its own.** Its labels start with three non-breaking spaces, so they are visibly apart from whatever comes before, whichever plugin that is. Non-breaking spaces cannot be trimmed or collapsed by a neighbor.
- **It takes only what is left.** It measures the terminal width, the hint line, and the labels already present, caps itself at 64 columns, and keeps 16 free for other mods' drawings. If that is not enough it drops the region first, then shortens the user, then keeps only the environment. A warning is always kept.
- **It never rewrites or removes another mod's labels.** It only appends its own, and it only observes the hint line.

The figures for the footer's padding and mode label are estimates of Claude Code's layout, not a documented contract. On a very narrow terminal another plugin may still wrap.

The user is taken from the principal ARN: the user name of an IAM user, or the session name of an assumed role. With IAM Identity Center that is your user name, often an email address, so it will be visible if you share your screen.

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
| Mod       | Labels in the prompt footer        | Reads one local file, adds labels. No network, no process, no write       | Automatic                         |
| Command   | `dist/statusline.mjs`              | Reads one local file, prints one line                                     | Opt-in, from your `settings.json` |
| Skill     | `/aws-ui:statusline [setup\|copy]` | `setup`: read. `copy`: writes one file under your Claude config directory | Manual only                       |

What the mod can do is limited and checkable: `claude plugin validate plugins/aws-ui` lists every mods API call it makes. They are `$.fs.stat`, `$.fs.read`, `$.env.get` (three variables that locate your config directory), `$.session.root`, `$.clock`, and `$.ui.invalidate`. It observes `PromptHint` (without changing it) to know how much room is left. It does not draw anything itself and has no `$.http`, `$.process`, `$.model`, `$.fs.write`, or `$.store`. A test enforces this.

## Where it shows

The footer labels (`SessionMode`) are raised on the terminal and in the Desktop app. They are not drawn in `claude -p`, the Agent SDK, cloud sessions, or WSL sessions of the Desktop app, because mods do not draw there. The VS Code extension is unverified. Where the footer is missing, use the status line.

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

It prints the same content as the footer: `carol@example.com · us-east-1 · production · AWS check stale`, or an empty line when there is nothing to show.

The script path inside the plugin cache changes when the plugin updates. `/aws-ui:statusline copy` writes one stable copy to `<claude config dir>/aws-ui/statusline.mjs` and prints a snippet that points at it; run it again after updating `aws-ui` to refresh the copy.

If you already have a status line, keep it and call this one from yours, then print both lines:

```sh
#!/bin/sh
input=$(cat)
your-existing-command <<INPUT
$input
INPUT
printf '%s' "$input" | node "$HOME/.claude/aws-ui/statusline.mjs"
```

On Windows, write the path with forward slashes in `settings.json`: Git Bash treats backslashes as escapes.

## Configuration

None. The time a check stays fresh (`ttlMinutes`) and the account-to-environment mapping belong to `aws-context`; see its README.

## AWS permissions

None. This plugin makes no AWS calls. It needs no credentials and never reads them.

## Data and privacy

- **Reads:** the snapshot `<claude config dir>/aws-context/v1/<workspace id>.json`. Nothing else, and no credential files.
- **Writes:** nothing, except `/aws-ui:statusline copy`, which writes one script file you asked for.
- **Shows:** the user name taken from the principal ARN, the region, the environment if classified, and a warning if any. Not the account ID, the profile, or the ARN.
- **Telemetry:** none.

## Limitations

- **Freshness is bounded by `aws-context`.** The footer does not verify anything. After the time-to-live (default 5 minutes) it shows `AWS check stale` until a refresh (`/aws-context:status refresh`) writes a new snapshot. The mod checks the file every 5 seconds.
- **Which project.** The mod finds the snapshot from the session's project root, and the `aws-context` hook from `CLAUDE_PROJECT_DIR`. They normally match; after a `/cd` into another directory they may not, and the footer then shows nothing until a refresh for that directory. Unverified in a real session.
- **Not an enforcement point.** Seeing `production` here does not stop any command. IAM, SCPs, and permission boundaries do that.
- **Labels are plain text.** Claude Code draws them in its own style, so they cannot be colored; the warning is words, not color.
- **Mods are code that runs inside Claude Code.** Install from sources you trust, and review with `claude plugin validate`. Mods can be turned off with `--safe-mode`, `disableAllHooks`, or by disabling the plugin.

## Verify it by hand

1. `pnpm build`, then `claude --plugin-dir plugins/aws-context --plugin-dir plugins/aws-ui`.
2. `/plugin` shows `1 mod active · aws-ui`.
3. With nothing stored, the footer shows no AWS label.
4. `/aws-context:status refresh` with valid credentials: within a few seconds the footer shows your user and region.
5. Wait past the time-to-live: `AWS check stale` appears next to the last known identity, without any AWS call.
6. `claude -p "hello" --plugin-dir plugins/aws-ui`: no error and no label (mods do not draw in `-p`).
7. `/plugin disable aws-ui@claude-code-aws`: the label disappears and Claude Code is otherwise unchanged.

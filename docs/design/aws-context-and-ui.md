# Design: `aws-context` and `aws-ui`

**Status:** accepted for implementation. Source requirements: [CONTEXT_UI_SPEC.md](../CONTEXT_UI_SPEC.md) and [CLAUDE.md](../../CLAUDE.md). This document records how the spec is implemented in this repository, where it deviates, and why.

Platform facts below were checked against the Claude Code documentation on 2026-10-27 and Claude Code 2.1.309. Items marked **Unverified** are not yet confirmed in a real session.

## 1. Overview

```text
AWS SDK / STS ──► aws-context ──► snapshot file (versioned JSON, per workspace)
                                     │
                                     ├──► aws-ui mod (band above the prompt)
                                     └──► aws-ui status-line script (opt-in)
```

| Unit                        | Kind             | Responsibility                                                                                                                                                 |
| --------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/context-contract` | internal library | Snapshot schema and validator, snapshot location, workspace id, config schema, environment classification, bar formatting. Pure, no AWS and no Node-only APIs. |
| `plugins/aws-context`       | plugin           | Resolves identity with STS, writes the snapshot, exposes the CLI, a `status` skill, and a `SessionStart` hook.                                                 |
| `plugins/aws-ui`            | plugin (mod)     | Renders the snapshot. Never calls AWS. Works with no `aws-context` installed (shows `Not configured`).                                                         |

The two plugins share nothing at runtime except the snapshot file format. Each bundles its own copy of `context-contract` at build time. Neither declares a dependency on the other.

## 2. Decisions that differ from the spec

| #   | Spec says                                         | This design                                                                                                                                                                                                                                                      | Reason                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Packages `context-contract` and `context-runtime` | One package, `context-contract`. AWS resolution lives inside `plugins/aws-context`.                                                                                                                                                                              | Only the contract is used by two plugins. CLAUDE.md: add shared packages only when more than one plugin needs the code.                                                                                                                              |
| D2  | OS-appropriate cache directory                    | `<claude config dir>/aws-context/v1/` where the config dir is `$CLAUDE_CONFIG_DIR`, else `~/.claude`.                                                                                                                                                            | A mod's hooks module has no Node APIs (no `os`, no `process.platform`); it only has `$.fs` and `$.env`. Both plugins must compute the same path from environment variables alone. The directory is private to the user and outside every repository. |
| D3  | YAML config                                       | JSON, in two layers: project `.aws-context.json` and user `<claude config dir>/aws-context/config.json`.                                                                                                                                                         | No parser dependency. Chosen by the maintainer.                                                                                                                                                                                                      |
| D4  | Config maps account to environment                | Trust rule in §5: a **project** file may only raise an account to `production`. `non-production` is honored only from the **user** file.                                                                                                                         | The project file is repository content, which CLAUDE.md treats as untrusted. A cloned repo must not be able to relabel a production account as safe.                                                                                                 |
| D5  | `hooks/register.js` produced in `hooks/`          | The mod is bundled to `dist/register.js` and `hooks/hooks.json` points to `../dist/register.js`. **Verified** with `claude plugin validate` on 2.1.295 and 2.1.309 that a `modules` path may leave `hooks/`. Loading in a real session is still to be confirmed. | Generated files stay under `dist/` (gitignored, already in the release allowlist).                                                                                                                                                                   |
| D6  | Skill `status`                                    | The skill also accepts `refresh` and `config`. No separate refresh skill.                                                                                                                                                                                        | One thin skill, three deterministic CLI verbs, no inference by the model.                                                                                                                                                                            |
| D7  | `diagnosticCode` is "sanitized and stable"        | Closed enumeration (§4.3). SDK error messages are used only to choose a code and are never stored.                                                                                                                                                               | SDK errors can embed profile names, paths, or request ids.                                                                                                                                                                                           |

## 3. Platform constraints that shape the design

| Fact                                                                                                                                         | Consequence                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A mod's hooks module has no Node APIs and no network or file access of its own. It reaches files through `$.fs`, timers through `$.clock`.   | The mod polls the snapshot file with `$.fs` on a timer and keeps the parsed value in `$.state`. Render reads only `$.state`. |
| A mod imports only files inside the plugin directory; `claude plugin validate` statically analyses `$.ns.method` calls and rejects aliasing. | Bundle with esbuild, **no minification**, keep `$` untouched, write every `$` call in full.                                  |
| Mods do not draw in `claude -p`, the Agent SDK, cloud sessions, or WSL Desktop sessions.                                                     | Ship the opt-in status-line script and the text CLI/skill as fallbacks.                                                      |
| A plugin cannot set the main status line. Only one `statusLine` command exists per user.                                                     | Document an opt-in snippet and a composition example. Never edit `~/.claude/settings.json`.                                  |
| The band above the prompt is shared by all mods and the user can collapse it (Ctrl+X Ctrl+A). Nothing tells the mod it is collapsed.         | The band is informative only. Anything the user must act on is also available through the skill output.                      |
| Exec-form hooks work; a missing `node` makes a hook fail non-blocking.                                                                       | `SessionStart` is advisory and fails open. This milestone has no blocking hook.                                              |
| Status-line commands run through Git Bash or PowerShell on Windows; backslash paths break under Git Bash.                                    | Document forward-slash paths for the opt-in snippet.                                                                         |

## 4. `aws-context`

### 4.1 Components

```text
plugins/aws-context/
  .claude-plugin/plugin.json
  hooks/hooks.json            SessionStart (startup|resume), exec form, timeout 10 s
  skills/status/SKILL.md      side effects: local-write (cache) + read-only STS call
  src/entries/cli.ts          aws-context status|refresh|config show|purge
  src/entries/session-start.ts
  src/lib/…                   resolve.ts, sts.ts, classify.ts, store.ts, diagnostics.ts
```

No agent, no MCP server, no `bin/` directory (claude.ai organization sync rejects it). The CLI runs as `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs`.

### 4.2 Resolution

1. **Workspace.** Directory from `$CLAUDE_PROJECT_DIR`, else `cwd`. `workspaceId` is the SHA-256 (first 16 hex chars) of the path with separators normalized to `/`, trailing separators removed, and lowercased on Windows. No `realpath`, because the mod cannot call it; both sides hash the string Claude Code gives them.
2. **Profile.** `AWS_PROFILE` if set, else `null`. The tool never reads `~/.aws/*` itself; the SDK does. Profile is reported as "configured selection", never as proof.
3. **Region.** The SDK's own resolution (`AWS_REGION`, then the selected profile), then `AWS_DEFAULT_REGION`, which the AWS CLI honors but the SDK for JavaScript ignores. If none resolves, `region` is `null`. STS is then called through the `us-east-1` endpoint only so that the call can be made; the snapshot still says `region: null` and records `REGION_UNRESOLVED`. In partitions other than `aws` (GovCloud, China) that call fails and is reported as an ordinary error.
4. **Identity.** One `GetCallerIdentity` call through the default credential provider chain (env, SSO, profiles, assumed roles, container and instance credentials). 5 s timeout, one retry for network errors only, no polling. No credential parsing of our own. No role assumption. No fallback to another profile. Observed with the SDK: when `AWS_PROFILE` is set, the SDK skips environment credentials and fails if the profile does not exist; the plugin reports that failure instead of hiding it (the spec's "environment credentials override profile" row does not hold for the SDK).
5. **Environment.** Classified from the **verified** account id through §5. Without a verified or carried account the environment is `unknown`.
6. **Failure.** The snapshot records the state and a diagnostic code. The previous verified identity is carried over only when the profile is unchanged, and always together with `verification` ≠ `verified`, so consumers cannot present it as current (§4.4).

### 4.3 Snapshot contract (`AwsContextSnapshotV1`)

As in the spec §4.4, with these precise rules.

| Field            | Rule                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`  | Literal `1`. Any other value is treated as no snapshot.                                                                                                                                          |
| `workspaceId`    | 16 hex chars, never a path.                                                                                                                                                                      |
| `profile`        | Configured name or `null`. Max 128 chars, otherwise `null`.                                                                                                                                      |
| `region`         | Matches `^[a-z]{2}(-[a-z]+)+-\d$` or `null`.                                                                                                                                                     |
| `accountId`      | 12 digits or `null`. When `verification` is not `verified`, it is the last known account or `null`.                                                                                              |
| `principalArn`   | An `arn:` string up to 2048 chars, or `null`. Never shown in the bar. It can contain a user name or email (SSO), so only `aws-context status` shows it.                                          |
| `environment`    | `production`, `non-production`, `unknown`.                                                                                                                                                       |
| `verification`   | `verified`, `unverified`, `expired`, `error`.                                                                                                                                                    |
| `verifiedAt`     | ISO 8601 UTC. Time of the last successful STS call, even when the current state is not `verified`.                                                                                               |
| `staleAfter`     | `verifiedAt` + TTL. Default TTL 5 minutes, configurable 1–60.                                                                                                                                    |
| `diagnosticCode` | One of: `NO_CREDENTIALS`, `SSO_EXPIRED`, `CREDENTIALS_EXPIRED`, `CREDENTIALS_INVALID`, `ACCESS_DENIED`, `REGION_UNRESOLVED`, `OFFLINE`, `TIMEOUT`, `CONFIG_INVALID`, `UNKNOWN_ERROR`, or `null`. |

The validator rejects unknown extra keys, so a future field cannot leak through an old reader. A corrupt, truncated, oversized (> 16 KiB), or old-schema file is ignored and reported as no snapshot.

### 4.4 Interpreting a snapshot (shared, in `context-contract`)

`interpret(snapshot, now)` returns one display state. Order of precedence:

| State            | When                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `not-configured` | No snapshot, or `NO_CREDENTIALS` with no profile and no last-known account. |
| `expired`        | `verification = expired` (`SSO_EXPIRED`, `CREDENTIALS_EXPIRED`).            |
| `offline`        | `verification = error` with `OFFLINE` or `TIMEOUT`.                         |
| `error`          | Any other `verification = error`.                                           |
| `unverified`     | `verification = unverified`.                                                |
| `stale`          | `verification = verified` and `now > staleAfter`.                           |
| `verified`       | `verification = verified` and `now <= staleAfter`.                          |

A non-`verified` state with a stored account always renders it as "last known". Only `verified` renders the account as current.

### 4.5 Storage

- Path: `<claude config dir>/aws-context/v1/<workspaceId>.json`.
- Atomic write: temp file in the same directory, then rename. Directory mode `0700`, file mode `0600` where the OS supports it.
- Contents are the snapshot only. No environment variables, no raw errors, no credentials.
- Retention: snapshots untouched for 7 days are deleted on the next refresh. `aws-context purge` deletes all of them. Uninstalling the plugin leaves the directory; the README says how to remove it.
- The snapshot is a display cache. It must never authorize an operation.

### 4.6 CLI

```text
aws-context status [--json]    read the snapshot (no network); say if absent or stale
aws-context refresh [--json]   verify with STS, write the snapshot, print it
aws-context config show        effective config, which layer set each value, and warnings
aws-context purge              delete every stored snapshot
```

Exit codes: `0` success (including degraded states, which are reported in output), `2` usage error. `status` never calls the network; `refresh` is the only verb that does.

### 4.7 Skill `status`

Frontmatter: `allowed-tools` limited to `Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs *)`, so the skill needs no prompt for its own CLI. Arguments: `status` (default), `refresh`, `config`. The skill tells Claude to run the CLI, summarize its JSON, and **not** to read `~/.aws` or infer identity from any other source. It states the side effects: `refresh` makes one read-only STS call and writes the cache file. If asked to switch profile it explains how the user does that themselves and offers to run `refresh` afterwards. There is no `switch` verb.

### 4.8 `SessionStart` hook

Runs on `startup|resume`, runs `refresh` with a 5 s verification budget, writes the snapshot, and returns `additionalContext` of one short block: masked account, region, environment, verification state, profile, and a reminder that the cache is not authorization. Any failure ends in a degraded snapshot and still exits 0. The hook performs the only implicit network call in the plugin.

## 5. Environment classification

Config file (both layers):

```json
{
  "version": 1,
  "ttlMinutes": 5,
  "accounts": {
    "123456789012": { "environment": "production" },
    "210987654321": { "environment": "non-production" }
  },
  "ui": { "maskAccountId": true, "showProfile": true }
}
```

Rules:

1. Keys are 12-digit account ids. A profile name is never an input.
2. Effective environment of a verified account:
   - `production` if **either** layer says `production`;
   - else `non-production` if the **user** layer says `non-production`;
   - else `unknown`.
3. A project-layer `non-production` claim is ignored for classification and reported by `config show` as "not trusted (project file)". A user-layer entry can never be overridden by the project layer in the direction of less caution.
4. `ttlMinutes` and `ui.*` are **user-file only**. A repository file cannot lengthen the "verified" window or unmask account ids, so the project file carries `accounts` and nothing else (other keys are ignored with a warning). Invalid values fall back to defaults and add a warning.
5. Malformed JSON, unknown keys, or non-12-digit keys produce `CONFIG_INVALID` warnings in `config show` and are ignored. Classification then falls back to `unknown`, never to a guess.

## 6. `aws-ui`

### 6.1 Components

```text
plugins/aws-ui/
  .claude-plugin/plugin.json
  hooks/hooks.json            { "modules": ["../dist/register.js"] }   (see D5)
  src/mod/register.ts         bundled to dist/register.js (ESM, platform-neutral, not minified)
  src/entries/statusline.ts   bundled to dist/statusline.mjs (Node, opt-in)
  src/lib/…                   locate.ts, bar.ts (re-exports from context-contract)
  README.md                   install, opt-in status line, limits
```

### 6.2 The mod

It adds labels to the prompt footer instead of drawing its own band. The `SessionMode` render site is the dim list of mode labels at the right of the footer (`focus`, `memory paused`); a hook adds a label by rewriting `modes`. This takes no extra row, is not shared with surveys like the band above the prompt, and is drawn in Claude Code's own colors and type, so the mod defines no styles. (Chosen after the first release drew a band above the prompt, which the maintainer found intrusive.)

- `session.start`: read the snapshot once, start `$.clock.every(5000, …)`.
- Poll: `$.fs.stat` the snapshot; re-read and re-validate only when size or mtime changed; keep the result in module variables. The path comes from three `$.env.get` reads (`CLAUDE_CONFIG_DIR`, `USERPROFILE`, `HOME`) and the workspace id from `$.session.root()`. No network, no process spawn, no `$.model` call, and no drawing calls; a test reads `claude plugin validate` output and fails if any appear. When the interpreted state changes (for example verified to stale as time passes) it invalidates `ui.render`.
- `ui.render` with `{ component: 'SessionMode' }`: `footerLabels(interpret(snapshot, now))` gives up to two labels. If both are null it returns `next(e)` unchanged; otherwise it appends them to the labels already present.

Content rules (`footerLabels` in the contract):

- Identity label: `user · region · environment`, each part only if known. The user is `principalName(arn)`: the IAM user name, or the session name of an assumed role (the person's user name under IAM Identity Center), or `root`. Control characters are dropped and the length is bounded. The environment is shown only when classified (`production` or `non-production`).
- Warning label, only when the state is not `verified`: `AWS check stale`, `AWS session expired`, `AWS offline`, `AWS unverified`, `AWS check failed`. The identity beside a warning is the last known one.
- No label at all when there is no context. The account ID and profile are never shown here.

Surfaces: the footer labels are raised on the terminal and Desktop. Elsewhere use the status line.

### 6.3 Status-line fallback

`dist/statusline.mjs` reads the Claude Code status-line JSON from stdin, takes `workspace.project_dir` (else `workspace.current_dir`, `cwd`), reads the snapshot with `node:fs`, prints one line from the same `footerLabels` (`formatFooterLine`), and exits 0 on every error with the `not configured` line. It never runs STS.

Setup is documented and never automatic. The plugin cache path changes with every plugin version, so a snippet that points at it breaks on update. The skill `/aws-ui:statusline` (manual only) runs `statusline.mjs setup`, which:

1. reports whether the user already has a `statusLine` (reading only that key of `settings.json`, never printing anything else from it);
2. prints a `settings.json` snippet for the user to paste (forward slashes, `refreshInterval: 10`);
3. with `copy` / `--copy`, writes **one** file, a copy of the script at `<claude config dir>/aws-ui/statusline.mjs`, so the snippet's path is stable (re-run after updating).

It never edits `settings.json`. If a status line already exists, it says so and explains how to call this script from inside the user's own. **Unverified:** behavior on Windows (Git Bash vs PowerShell) beyond forward-slash paths.

## 7. Security requirements

1. Output, logs, snapshots, and errors never contain access keys, secret keys, session tokens, SSO tokens, or raw SDK error text. A test runs every code path with sentinel secrets in the environment and asserts none appear (`findSecretLikeStrings` plus exact sentinel matching).
2. The only AWS API called is `sts:GetCallerIdentity`, which needs no IAM permissions.
3. No writes outside `<claude config dir>/aws-context/`. No edits to `~/.aws`, `~/.claude/settings.json`, shell profiles, or other plugins.
4. Repository content is untrusted (§5 rule 3). Config is parsed as data only.
5. `status` and the UI make no network calls. Only `refresh` and the `SessionStart` hook do.
6. No telemetry.
7. These plugins do **not** enforce anything. The snapshot is information, not authorization. The enforcement boundary remains IAM, SCPs, and permission boundaries, as in the [security model](../security-model.md).

## 8. Test plan

| Layer         | What                                                                                                                                                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract unit | Schema accept/reject (extra keys, bad region, 11-digit account, oversized, wrong version); `interpret` for every state and boundary of `staleAfter`; workspace id stability and Windows normalization; bar formatting at widths 20–200, with and without masking; config layering and the trust rule. |
| Context unit  | Error → diagnostic code mapping; carry-over rules; classification; retention pruning; atomic write; permission bits on POSIX.                                                                                                                                                                         |
| STS mock      | A fake STS client: success, expired token, invalid token, SSO expired, no credentials, timeout, DNS failure, region unresolved. No network.                                                                                                                                                           |
| Negative      | Wrong account (config says production, STS says another), wrong region, expired credentials, missing region, corrupt snapshot, hostile project config, secrets in env.                                                                                                                                |
| Hook contract | `runPluginHooks` against `SessionStart`: valid JSON on stdout, exit 0 in every degraded state, no secret-like output, completes within its timeout when STS hangs.                                                                                                                                    |
| Mod           | `claude plugin test` with stubbed `$.fs`/`$.env`/`$.session`: not configured, fresh, stale, corrupt file, file changing between polls; assert no `$.http`, `$.process`, or `$.model` call is ever made.                                                                                               |
| Status line   | Run the bundle with piped JSON, with and without a snapshot, with a hostile `workspace.project_dir`.                                                                                                                                                                                                  |
| Packaging     | Existing `test:packaging`: install each plugin alone from a local marketplace, run from the cache, disable and uninstall. Install both together.                                                                                                                                                      |
| Real session  | Manual checklist in each README: band renders, collapses, survives `/reload-plugins`, `--plugin-dir` hot reload, `claude -p` shows nothing and does not fail.                                                                                                                                         |

CI uses no AWS account and no network.

## 9. Delivery order

1. `packages/context-contract` with tests.
2. `plugins/aws-context`: resolution, store, CLI, skill, hook, tests, validate, packaging.
3. `plugins/aws-ui`: status-line script first (simplest consumer), then the mod.
4. READMEs, changesets (`minor`, first release `0.1.0` for both), `pnpm verify`.
5. Real-session check on 2.1.309 using `--plugin-dir`, with mocked and, only if the maintainer provides credentials in the shell, a real identity.

Not done in this milestone: a `switch` command, a details pane, the future panels in spec §5.4, and any enforcement or guard behavior (`aws-guard` is a separate future plugin).

## 10. Open items

| Item                                                                                | Status                                                                                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Can `modules` point outside `hooks/` (D5)?                                          | Yes for `claude plugin validate` (2.1.295 and 2.1.309). Real-session load not yet confirmed.                          |
| How the mod learns the workspace directory                                          | `$.session.root()` (declared in the 2.1.309 types). Whether it equals `CLAUDE_PROJECT_DIR` after `/cd` is unverified. |
| Does unminified esbuild output pass the `$` static analysis?                        | Yes: validate lists every call, including those reached through top-level helper functions.                           |
| `claude plugin test` with vitest files in the same plugin                           | It runs every `*.test.ts` in the plugin directory, so plugins with a mod name their vitest files `*.spec.ts`.         |
| Min supported Claude Code (2.1.295)                                                 | Validate and all 10 mod tests pass on 2.1.295.                                                                        |
| `AbovePrompt` rendering in the Desktop app and the VS Code extension                | The types list the terminal only. Treated as unverified; README says so.                                              |
| Status-line path discovery and quoting on Windows                                   | Unverified; forward-slash paths documented.                                                                           |
| Real-session behavior of the band (draw, collapse, hot reload, `/plugin` mod count) | Manual checklist in `plugins/aws-ui/README.md`; not yet executed in an interactive session.                           |

---
"aws-context": minor
---

Keep the stored check from going stale in long sessions: a background `UserPromptSubmit` hook re-verifies with STS when the check is older than its time-to-live (a failed check is retried once per window), and the prompt never waits for it. Turn it off with `autoRefresh: false` in your user config. Also: a last-known identity is no longer carried over when no named profile is selected (environment credentials may belong to another account), the session context now says the check describes Claude Code's own process, the `status` skill can no longer run `purge`, and `config show` reports the new `autoRefresh` and `ui.showUser` options.

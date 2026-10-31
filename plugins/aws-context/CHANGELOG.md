# aws-context

## 0.2.1

### Patch Changes

- [#15](https://github.com/Alejo2075/claude-code-aws/pull/15) [`739d2ca`](https://github.com/Alejo2075/claude-code-aws/commit/739d2ca56babfc97f60c71802f1167deb9c67a1f) Thanks [@Alejo2075](https://github.com/Alejo2075)! - Internal: the STS check, region resolution, and error classification now live in a shared package that other plugins will reuse. No change in behavior.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Alejo2075/claude-code-aws/pull/10) [`9285788`](https://github.com/Alejo2075/claude-code-aws/commit/928578805534fc8434f405f943a58d7ea36cd15d) Thanks [@Alejo2075](https://github.com/Alejo2075)! - Keep the stored check from going stale in long sessions: a background `UserPromptSubmit` hook re-verifies with STS when the check is older than its time-to-live (a failed check is retried once per window), and the prompt never waits for it. Turn it off with `autoRefresh: false` in your user config. Also: a last-known identity is no longer carried over when no named profile is selected (environment credentials may belong to another account), the session context now says the check describes Claude Code's own process, the `status` skill can no longer run `purge`, and `config show` reports the new `autoRefresh` and `ui.showUser` options.

## 0.1.0

### Minor Changes

- [#3](https://github.com/Alejo2075/claude-code-aws/pull/3) [`10b2b7c`](https://github.com/Alejo2075/claude-code-aws/commit/10b2b7caacce0409345926b603b6b91499074a77) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release of `aws-context` and `aws-ui`.
  
  `aws-context` verifies the active AWS identity with STS `GetCallerIdentity`, keeps a validated per-workspace snapshot, and exposes `/aws-context:status` (status, refresh, config) and a session-start check. It is read-only and never signs in, switches profiles, or edits AWS configuration.
  
  `aws-ui` shows the stored context in a band above the prompt and offers an opt-in status line. It never calls AWS.

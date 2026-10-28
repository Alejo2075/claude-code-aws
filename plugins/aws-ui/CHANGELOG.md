# aws-ui

## 0.1.0

### Minor Changes

- [#3](https://github.com/Alejo2075/claude-code-aws/pull/3) [`10b2b7c`](https://github.com/Alejo2075/claude-code-aws/commit/10b2b7caacce0409345926b603b6b91499074a77) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release of `aws-context` and `aws-ui`.
  
  `aws-context` verifies the active AWS identity with STS `GetCallerIdentity`, keeps a validated per-workspace snapshot, and exposes `/aws-context:status` (status, refresh, config) and a session-start check. It is read-only and never signs in, switches profiles, or edits AWS configuration.
  
  `aws-ui` shows the stored context in a band above the prompt and offers an opt-in status line. It never calls AWS.

# aws-ui

## 0.2.1

### Patch Changes

- [#8](https://github.com/Alejo2075/claude-code-aws/pull/8) [`d8ee300`](https://github.com/Alejo2075/claude-code-aws/commit/d8ee3006f1d87cb74071a1e328c49470966ae85c) Thanks [@Alejo2075](https://github.com/Alejo2075)! - Keep the footer labels apart from other plugins' drawings (such as a usage meter): they now start with their own gap, measure the room left in the row, and shrink (region, then a shortened user, then environment only) instead of pushing a neighbor to a second line.

## 0.2.0

### Minor Changes

- [#6](https://github.com/Alejo2075/claude-code-aws/pull/6) [`acbb9de`](https://github.com/Alejo2075/claude-code-aws/commit/acbb9dec179c1fbace6629ace3d5de383223ce57) Thanks [@Alejo2075](https://github.com/Alejo2075)! - Show the AWS user, region, and environment as labels in the prompt footer instead of a band above the prompt, so they take no extra row and use Claude Code's own colors and type. Only known values are shown, and a warning appears only when the context is stale, expired, offline, unverified, or failed. Nothing is shown when there is no context. The status-line command prints the same content. The account ID and profile are no longer shown (use `/aws-context:status`).

## 0.1.0

### Minor Changes

- [#3](https://github.com/Alejo2075/claude-code-aws/pull/3) [`10b2b7c`](https://github.com/Alejo2075/claude-code-aws/commit/10b2b7caacce0409345926b603b6b91499074a77) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release of `aws-context` and `aws-ui`.
  
  `aws-context` verifies the active AWS identity with STS `GetCallerIdentity`, keeps a validated per-workspace snapshot, and exposes `/aws-context:status` (status, refresh, config) and a session-start check. It is read-only and never signs in, switches profiles, or edits AWS configuration.
  
  `aws-ui` shows the stored context in a band above the prompt and offers an opt-in status line. It never calls AWS.

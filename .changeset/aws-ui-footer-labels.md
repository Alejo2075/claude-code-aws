---
"aws-ui": minor
---

Show the AWS user, region, and environment as labels in the prompt footer instead of a band above the prompt, so they take no extra row and use Claude Code's own colors and type. Only known values are shown, and a warning appears only when the context is stale, expired, offline, unverified, or failed. Nothing is shown when there is no context. The status-line command prints the same content. The account ID and profile are no longer shown (use `/aws-context:status`).

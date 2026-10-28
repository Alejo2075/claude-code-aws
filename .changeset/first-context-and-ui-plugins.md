---
"aws-context": minor
"aws-ui": minor
---

First release of `aws-context` and `aws-ui`.

`aws-context` verifies the active AWS identity with STS `GetCallerIdentity`, keeps a validated per-workspace snapshot, and exposes `/aws-context:status` (status, refresh, config) and a session-start check. It is read-only and never signs in, switches profiles, or edits AWS configuration.

`aws-ui` shows the stored context in a band above the prompt and offers an opt-in status line. It never calls AWS.

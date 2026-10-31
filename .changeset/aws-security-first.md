---
"aws-security": minor
---

First release: an advisory, read-only security audit of synthesized CDK templates with twenty documented rules (IAM breadth and escalation, open trust and resource policies, public buckets, unauthenticated routes, secrets in environment variables, unsupported runtimes), IAM statement analysis, an AccessDenied message explainer, an API authorization matrix, and exclusions that stay visible, expire, and cannot hide serious findings from the project file. It makes no AWS calls and never blocks anything.

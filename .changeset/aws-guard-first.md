---
"aws-guard": minor
---

First release: a `PreToolUse` guardrail that asks for approval before AWS-changing shell commands and AWS MCP tools, in production, with an unverified target, or for destructive operations, and denies what your rules or unattended permission modes forbid. It never approves anything, makes no AWS calls, and is not an enforcement boundary.

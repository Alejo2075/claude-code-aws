# aws-guard

## 0.1.0

### Minor Changes

- [#13](https://github.com/Alejo2075/claude-code-aws/pull/13) [`eb82cd1`](https://github.com/Alejo2075/claude-code-aws/commit/eb82cd136b37d4696973adade436f7725a8a1858) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release: a `PreToolUse` guardrail that asks for approval before AWS-changing shell commands and AWS MCP tools, in production, with an unverified target, or for destructive operations, and denies what your rules or unattended permission modes forbid. It never approves anything, makes no AWS calls, and is not an enforcement boundary.

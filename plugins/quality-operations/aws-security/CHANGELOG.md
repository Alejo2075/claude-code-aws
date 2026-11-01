# aws-security

## 0.1.0

### Minor Changes

- [#21](https://github.com/Alejo2075/claude-code-aws/pull/21) [`c5258c2`](https://github.com/Alejo2075/claude-code-aws/commit/c5258c24236e722cf86ed1351dfa4f601cc39b81) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release: an advisory, read-only security audit of synthesized CDK templates with twenty documented rules (IAM breadth and escalation, open trust and resource policies, public buckets, unauthenticated routes, secrets in environment variables, unsupported runtimes), IAM statement analysis, an AccessDenied message explainer, an API authorization matrix, and exclusions that stay visible, expire, and cannot hide serious findings from the project file. It makes no AWS calls and never blocks anything.

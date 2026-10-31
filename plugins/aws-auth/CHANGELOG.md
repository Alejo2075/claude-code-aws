# aws-auth

## 0.1.0

### Minor Changes

- [#32](https://github.com/Alejo2075/claude-code-aws/pull/32) [`1b7b5d8`](https://github.com/Alejo2075/claude-code-aws/commit/1b7b5d828f0c26b5fa7934de4b5f3d4419404927) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release: inspect Cognito user pools and app clients in synthesized CDK output with security findings, check decoded token claims against issuer, audience, token use, expiry, scope, and group (tokens are refused and never echoed), and recommend sign-in flows by application type. Local-first: it makes no AWS calls and manages no users.

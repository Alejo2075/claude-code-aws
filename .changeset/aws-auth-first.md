---
"aws-auth": minor
---

First release: inspect Cognito user pools and app clients in synthesized CDK output with security findings, check decoded token claims against issuer, audience, token use, expiry, scope, and group (tokens are refused and never echoed), and recommend sign-in flows by application type. Local-first: it makes no AWS calls and manages no users.

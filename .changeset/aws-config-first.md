---
"aws-config": minor
---

First release: validate AppConfig feature flag documents against the published schema, check JSON configuration against a schema subset, plan gradual rollouts with bake time, and inspect AppConfig and Parameter Store resources in synthesized CDK output (parameter values are never shown). Local-first: it makes no AWS calls and changes no flag.

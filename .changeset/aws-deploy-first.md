---
"aws-deploy": minor
---

First release: plan and run CDK deployments so that what is reviewed is what is deployed. A plan binds the account, region, environment, and a hash of every template; deploy refuses on any difference, on an expired plan, on an unconfirmed production or unclassified target, and on unacknowledged destructive or permission-broadening changes, then deploys the reviewed cloud assembly (never hotswap). Also read-only status, rollback guidance that runs nothing, and a GitHub Actions OIDC pipeline generator.

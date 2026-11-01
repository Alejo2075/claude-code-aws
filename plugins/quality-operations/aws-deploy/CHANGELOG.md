# aws-deploy

## 0.1.0

### Minor Changes

- [#23](https://github.com/Alejo2075/claude-code-aws/pull/23) [`b5141df`](https://github.com/Alejo2075/claude-code-aws/commit/b5141dfce2d6221e686fe84b3a2a0decd818bd5a) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release: plan and run CDK deployments so that what is reviewed is what is deployed. A plan binds the account, region, environment, and a hash of every template; deploy refuses on any difference, on an expired plan, on an unconfirmed production or unclassified target, and on unacknowledged destructive or permission-broadening changes, then deploys the reviewed cloud assembly (never hotswap). Also read-only status, rollback guidance that runs nothing, and a GitHub Actions OIDC pipeline generator.

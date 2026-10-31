---
"aws-testing": minor
---

First release: run Vitest, Jest, or node:test with no AWS access and report failures tied to files (including only the tests related to your changes), event fixtures with edge-case variants for eight Lambda sources and validators for SQS partial-batch and API Gateway responses, generated policy assertions for synthesized CDK stacks and handler test skeletons, and a coverage summary. It never deploys and never calls AWS.

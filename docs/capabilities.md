# Capability matrix

Each capability a plugin promises is marked with what has actually been done:

- **implemented + tested**: working code with automated tests in CI.
- **implemented + unverified**: working code and tests against fakes, but never run against a real AWS account or a real interactive session.
- **not yet implemented**: planned in [the plan](design/serverless-plugins-plan.md); not claimed.

This file is updated by the pull request that changes a capability. The per-plugin READMEs hold the detail.

## Foundations

| Capability                                                                          | Status               |
| ----------------------------------------------------------------------------------- | -------------------- |
| `safe-output`: redaction of structured data and free text, terminal sanitizing      | implemented + tested |
| `report-contract`: versioned schemas, validators, text rendering                    | implemented + tested |
| `template-analysis`: inventory, graph, stateful and replacement catalogs, IAM, diff | implemented + tested |
| `tool-runner`: no shell, scrubbed environment, timeout, bounded output              | implemented + tested |
| Fixture corpus of real synthesized CDK templates                                    | implemented + tested |

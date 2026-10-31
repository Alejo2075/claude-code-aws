# Implementation matrix

Status vocabulary from the spec: `not-started | implemented | tested | unverified | blocked`. **tested** means deterministic unit and negative tests over fixtures pass; it never means the plugin was exercised against a real AWS account, a real Claude session, or the evals (none of which have been run). Every plugin is unpublished; the marketplace lists a plugin only at release.

Re-generate the test counts with `pnpm exec vitest run --reporter=json`. Validation: `pnpm validate` (28 plugins and the marketplace, with `claude plugin validate --strict`).

| Plugin                 | Category              | What it does                                                                              | Status | Tests | Known gaps                                                                     |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------------- | ------ | ----: | ------------------------------------------------------------------------------ |
| `aws-context`          | Existing              | Verified AWS identity, region, environment                                                | tested |    50 | STS never run against a real account                                           |
| `aws-ui`               | Existing              | Footer labels, status line (no panels)                                                    | tested |    22 | Report panel not implemented (L4)                                              |
| `aws-guard`            | Existing              | PreToolUse approvals for AWS-changing commands                                            | tested |   290 | A hook is not an enforcement boundary; IAM/SCP are                             |
| `aws-explorer`         | Existing              | Read-only inventory (CloudFormation, Cloud Control)                                       | tested |    49 | SDK adapter only against loopback fakes                                        |
| `aws-architect`        | Existing (refactored) | Requirements, options, decisions, ADRs, plan; `diagram` and `review` are deprecated shims | tested |    19 | `evolve` not implemented; evals not run                                        |
| `aws-infrastructure`   | Existing (refactored) | CDK inspect, synth, diff, review, scaffold, init, refactor                                | tested |    61 | `--deployed` only against fakes                                                |
| `aws-security`         | Existing              | Template audit, IAM, auth matrix, threat model (hypotheses), remediation proposals        | tested |    57 | Live-account checks and reviewer agent not implemented                         |
| `aws-testing`          | Existing              | Test runs, contracts, fixtures, coverage                                                  | tested |    50 | Integration runner / load tests not implemented                                |
| `aws-deploy`           | Existing              | Plan-bound preflight and deploy, rollback advice                                          | tested |    32 | No real deployment was ever run                                                |
| `aws-cost`             | Existing              | Dated-snapshot estimates and comparisons                                                  | tested |    41 | Cost Explorer `analyze`, `optimize`, `budgets` not implemented                 |
| `aws-observability`    | Existing              | Read-only status, logs, metrics, alarms, evidence ledger                                  | tested |    21 | SDK adapter never run against AWS                                              |
| `aws-diagrams`         | New (Design)          | Editable Mermaid diagrams with provenance, update/diff/export                             | tested |    15 | Real `mmdc` rendering never run; no UI panel                                   |
| `aws-prototyping`      | New (Design)          | Bounded PoCs, local queue model, plans for sandbox/cleanup/promotion                      | tested |    23 | Model is a simplification; sandbox runs are plans only                         |
| `aws-well-architected` | New (Design)          | Six-pillar evidence review, backlog, comparison                                           | tested |    20 | Questions are paraphrases; no Well-Architected Tool integration                |
| `aws-lambda`           | New (Development)     | Inspect, handler scaffold (tests executed), invoke plan, explain                          | tested |    12 | Never invokes; no live inspection                                              |
| `aws-api`              | New (Development)     | Route inspection, OpenAPI validation, contract diff, test plan                            | tested |     9 | GraphQL/AppSync not implemented                                                |
| `aws-auth`             | New (Development)     | Cognito inspection, decoded-claims check, flows                                           | tested |     8 | No signature verification (by design)                                          |
| `aws-events`           | New (Development)     | Rule/schedule inspection, pattern matcher, schedule/DST calculator                        | tested |    11 | Local matcher approximates EventBridge; DST behavior of the service unverified |
| `aws-messaging`        | New (Development)     | SQS/SNS inspection, filter-policy matcher, FIFO and backlog helpers                       | tested |     7 | No message access (by design)                                                  |
| `aws-workflows`        | New (Development)     | ASL validator, logical simulation, history summary                                        | tested |    14 | Simulation covers a subset                                                     |
| `aws-database`         | New (Development)     | DynamoDB key design, read cost, migration plan, Aurora inspection                         | tested |     8 | No row access (by design)                                                      |
| `aws-storage`          | New (Development)     | S3/EFS inspection, key safety, upload plan, lifecycle, policy review                      | tested |     9 | No object access (by design)                                                   |
| `aws-streaming`        | New (Development)     | Kinesis/Firehose inspection, shard sizing, partition placement                            | tested |     8 | No record access (by design)                                                   |
| `aws-edge`             | New (Development)     | CloudFront inspection, Function lint, cache review                                        | tested |     7 | Lint is not the runtime; no invalidations (by design)                          |
| `aws-ai`               | New (Development)     | Bedrock inspection, budget, chunking, prompt scan, RAG/agent review, eval scaffold        | tested |     7 | No model calls (by design); evals not run                                      |
| `aws-containers`       | New (Development)     | ECS/ECR inspection, Fargate sizes, Dockerfile review, scaffold                            | tested |     8 | Nothing built or pushed (by design)                                            |
| `aws-email`            | New (Development)     | SES inspection, template check, recipient dry-run, rate thresholds                        | tested |     8 | Nothing sent (by design)                                                       |
| `aws-config`           | New (Development)     | AppConfig flag/schema validation, rollout plan, inspection                                | tested |     9 | Nothing deployed (by design)                                                   |

## Shared packages

| Package              | Tests |
| -------------------- | ----: |
| `architecture-graph` |    15 |
| `aws-client`         |     7 |
| `content-filter`     |    10 |
| `context-contract`   |   103 |
| `report-contract`    |    11 |
| `safe-output`        |    37 |
| `template-analysis`  |    26 |
| `testkit`            |     9 |
| `tool-runner`        |    15 |

Cross-plugin scenarios: `tests/integration/scenarios.test.ts` (7 tests): diagrams from CDK output, the real security audit merged into a Well-Architected review, plan to diagram to prototype, event and workflow graphs into diagrams, and static checks that none of the 17 new plugins imports an AWS SDK client.

## Not verified, in one place

- Nothing ran against a real AWS account. SDK adapters (`aws-explorer`, `aws-observability`, `aws-infrastructure --deployed`, `aws-deploy`) only ran against fakes or loopback endpoints.
- Agent and skill evals were written but never run.
- No interactive Claude Code session loaded these plugins; install-from-cache is checked by `pnpm test:packaging` in CI.
- Local matchers and calculators (EventBridge patterns, schedules and daylight saving, SNS filters, Fargate sizes, Firehose ranges, S3 limits, SES thresholds) follow the AWS documentation read on 2026-10-31 and approximate the services; the services are the authority.
- Not implemented: aws-ui report panel, aws-cost Cost Explorer analysis, aws-testing integration runner, aws-security live checks, live inspection for the Development plugins, GraphQL/AppSync, `aws-architect evolve`.

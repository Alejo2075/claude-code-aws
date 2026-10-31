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

## aws-infrastructure

| Capability                                                        | Status                                         |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| Inventory, graph, stateful resources from `cdk.out` or a template | implemented + tested                           |
| Safe `synth` and failure diagnostics                              | implemented + tested (against a fake `cdk`)    |
| Template diff, replacement and deletion risk, rename detection    | implemented + tested                           |
| `diff --deployed`                                                 | implemented + unverified (fake endpoints only) |
| Nine operational-quality rules                                    | implemented + tested                           |
| Scaffolds: queue-lambda-dynamodb, http-api-cognito, s3-sqs-lambda | implemented + tested                           |
| Change-set backed diff                                            | not yet implemented                            |
| `refactor`, drift detection, CDK upgrade checks, multi-account    | not yet implemented                            |

## aws-security

| Capability                                                                         | Status                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------- |
| Twenty template rules (IAM, resource policies, S3, Lambda, API, KMS, SNS, Cognito) | implemented + tested                    |
| IAM statement listing, pasted-policy analysis, trust policies                      | implemented + tested                    |
| `AccessDenied` message explanation                                                 | implemented + tested (fixture messages) |
| API authorization matrix (HTTP and REST), JWT and CORS checks                      | implemented + tested                    |
| Exclusions with reason, expiry, and trust rules                                    | implemented + tested                    |
| Live-account checks, `threat-model`, `remediate`, reviewer agent, dependency audit | not yet implemented (0.2)               |

## aws-testing

| Capability                                                         | Status                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| `run` with Vitest (real runs), `--affected`, coverage              | implemented + tested                                      |
| `run` with Jest and `node:test`                                    | implemented + tested (parsers and plan; no real Jest run) |
| Event fixtures for eight sources with variants and response checks | implemented + tested                                      |
| `generate cdk-assertions` and `generate handler`                   | implemented + tested                                      |
| `coverage` summary                                                 | implemented + tested                                      |
| `integration`, affected-tests hook, `load`, property-based cases   | not yet implemented                                       |

## aws-deploy

| Capability                                                           | Status                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| `preflight` / `plan` with identity, environment, bootstrap, diff     | implemented + tested (fake CloudFormation)                |
| Plan binding (hashes, account, region, expiry) and the six gates     | implemented + tested                                      |
| `deploy` from the reviewed `cdk.out`, never hotswap                  | implemented + unverified (fake `cdk`; no real deployment) |
| `status`, `rollback` advice                                          | implemented + tested                                      |
| `pipeline` (OIDC, bootstrap-role-only policy, protected environment) | implemented + tested (generated text; never run)          |
| Change-set plans, rollback execution, CodeDeploy traffic shifting    | not yet implemented                                       |

## aws-observability

| Capability                                                                   | Status                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Function and queue status, DLQ depth, bounded redacted logs, metrics, alarms | implemented + unverified (fake API; SDK adapter never run) |
| Log analyzers and the evidence ledger with findings that cite it             | implemented + tested                                       |
| `incident-investigator` agent and two evals                                  | implemented + unverified (evals not run)                   |
| X-Ray traces, Step Functions history, API Gateway and DynamoDB telemetry     | not yet implemented                                        |
| Powertools guidance, SLO and error-budget reports, opt-in monitor            | not yet implemented                                        |

## aws-cost

| Capability                                                                     | Status                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `estimate` for seven services with tiers, assumptions, exclusions, sensitivity | implemented + tested (golden calculations checked by hand) |
| `compare`: Lambda memory, architecture, API type                               | implemented + tested                                       |
| Price snapshot (us-east-1, from the public Price List)                         | implemented + tested (dated snapshot)                      |
| `analyze` (Cost Explorer), `optimize`, `budgets`, cost-analyst agent           | not yet implemented                                        |
| Other regions, Express workflows, DynamoDB provisioned, S3, EventBridge        | not yet implemented                                        |

## aws-architect

| Capability                                                      | Status                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `diagram` with declared and inferred links                      | implemented + tested (real CDK fixtures)                      |
| `review`: eleven template-answerable questions with evidence    | implemented + tested                                          |
| `decisions`: six tables with sources                            | implemented + unverified (summaries not checked line by line) |
| `intake`, `plan init` / `check`, `adr` (write never overwrites) | implemented + tested                                          |
| `serverless-architect` agent and two evals                      | implemented + unverified (evals not run)                      |
| `evolve`, VPC and Cognito diagrams, deployed-state diagrams     | not yet implemented                                           |

## aws-diagrams

| Capability                                                   | Status                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `from-cdk` with declared and inferred links, stacks as boxes | implemented + tested (real CDK fixtures)                        |
| `generate` from plan, inventory, graph; seven view types     | implemented + tested                                            |
| State graph from an ASL definition                           | implemented + tested                                            |
| `update`, `diff`, `validate`, stable ids, label redaction    | implemented + tested                                            |
| `export`: Mermaid source                                     | implemented + tested                                            |
| `export`: SVG/PNG through the Mermaid CLI                    | implemented + unverified (fake renderer; real `mmdc` never run) |
| Live inventory reads, rendering in `aws-ui`                  | not yet implemented                                             |

## aws-well-architected

| Capability                                                                  | Status                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Six pillars, 30 questions (13 evaluated from templates), evidence strengths | implemented + tested                                                             |
| Specialist report merge by rule id                                          | implemented + tested (hand-built reports; real plugin output not run end to end) |
| Backlog, improvement plan, compare, stale and conflicting evidence          | implemented + tested                                                             |
| `well-architected-reviewer` agent and two evals                             | implemented + unverified (evals not run)                                         |
| Reading evidence from the account; AWS Well-Architected Tool records        | not yet implemented                                                              |

## aws-prototyping

| Capability                                                     | Status                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `start`, `validate`, manifest bounds, secret and wildcard scan | implemented + tested                                        |
| Local queue model, `experiment`, `record`, `compare`           | implemented + tested (model hand-checked on limiting cases) |
| `sandbox-plan`, `cleanup-plan`, `promote` (plans only)         | implemented + tested                                        |
| Skill evals                                                    | implemented + unverified (evals not run)                    |
| Running on AWS; models for APIs, workflows, Bedrock latency    | not yet implemented                                         |

## aws-events

| Capability                                                   | Status                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `inspect` rules (8 rule ids) over declared resources         | implemented + tested                                                                                                                       |
| `test`: pattern matcher (10 operators) against sample events | implemented + tested (operators from the EventBridge documentation; edge cases such as arrays of objects not verified against the service) |
| `schedule`: at, rate, cron with time zones and DST notes     | implemented + tested (hand-checked New York cases); service behavior in DST gaps unverified                                                |
| `envelope`, `graph`                                          | implemented + tested                                                                                                                       |
| cron `W`, `#`, and offset `L` syntax                         | not yet implemented (reported as unsupported, never guessed)                                                                               |
| Live inspection through the AWS SDK                          | not yet implemented                                                                                                                        |

## aws-messaging

| Capability                                                                | Status                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `inspect` rules (11 rule ids) over declared queues, topics, subscriptions | implemented + tested                                                              |
| `filter-test`: SNS filter policy matcher for attributes and body          | implemented + tested (local approximation; SNS operator differences not verified) |
| `fifo-check`: group and deduplication id rules                            | implemented + tested (group id limit from the SQS quotas page)                    |
| `diagnose`: backlog hypotheses from supplied numbers                      | implemented + tested (rules of thumb, not a diagnosis)                            |
| Receiving, previewing, or redriving messages                              | not implemented by design (needs explicit approval and a live adapter)            |
| Live inspection through the AWS SDK                                       | not yet implemented                                                               |

## aws-streaming

| Capability                                                                      | Status                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `inspect` rules (7 rule ids) over declared streams, consumers, delivery streams | implemented + tested                                                |
| `shards`: provisioned-mode estimate from the quota page limits                  | implemented + tested (hand-checked cases)                           |
| `partition-check`: MD5 placement on equal shard ranges, hot-key warnings        | implemented + tested (assumes a stream that has not been resharded) |
| `record-check`, `diagnose`                                                      | implemented + tested                                                |
| Reading metrics, resharding, starting load tests                                | not implemented by design                                           |
| Live inspection through the AWS SDK                                             | not yet implemented                                                 |

## aws-storage

| Capability                                                                      | Status                                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `inspect` rules (8 rule ids) over declared buckets, file systems, access points | implemented + tested                                                                      |
| `upload-plan` within the S3 multipart limits                                    | implemented + tested (limits read from the S3 multipart upload limits page on 2026-10-31) |
| `key-check`, `lifecycle`, `access`                                              | implemented + tested                                                                      |
| Reading, copying, or deleting objects; lifecycle cost modeling                  | not implemented by design / not yet implemented                                           |
| Live inspection through the AWS SDK                                             | not yet implemented                                                                       |

## aws-workflows

| Capability                                                    | Status                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `validate`: 20+ structural and flow checks, Express limits    | implemented + tested                                                                                   |
| `inspect` over CDK output with placeholders for references    | implemented + tested                                                                                   |
| `graph` to Mermaid and ArchitectureGraph                      | implemented + tested                                                                                   |
| `simulate`: Choice, Pass, Wait, Succeed, Fail, mocked Task    | implemented + tested (a subset; Parallel, Map, retries, and input/output processing are not simulated) |
| `debug` from an exported history                              | implemented + tested (hand-built history; real exports not exercised)                                  |
| Starting, stopping, or changing executions and state machines | not implemented by design                                                                              |
| Live inspection through the AWS SDK                           | not yet implemented                                                                                    |

## aws-lambda

| Capability                                                                       | Status                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `inspect`: 11 rule ids over declared functions; env values never shown           | implemented + tested                                                       |
| `create`: six event sources; generated tests executed under the Node test runner | implemented + tested                                                       |
| `invoke`: validated plan with DryRun form; never run                             | implemented + tested                                                       |
| `explain`: 8 topics, limits read from the Lambda quotas page on 2026-10-31       | implemented + tested                                                       |
| Invoking a function, reading real durations or logs                              | not implemented by design (use /aws-observability for read-only telemetry) |
| Live inspection through the AWS SDK                                              | not yet implemented                                                        |

## aws-api

| Capability                                                             | Status                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| `inspect`/`routes` over HTTP, REST, WebSocket: 6 rule ids              | implemented + tested                            |
| `validate`: OpenAPI 3 structural and convention checks (JSON and YAML) | implemented + tested (local references only)    |
| `contract-diff`, `test-plan`                                           | implemented + tested                            |
| GraphQL (AppSync) schema validation                                    | not yet implemented                             |
| Sending requests, inspecting deployed stages                           | not implemented by design / not yet implemented |
| Live inspection through the AWS SDK                                    | not yet implemented                             |

## aws-auth

| Capability                                                                        | Status                                                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `inspect`: 13 rule ids over declared pools and clients                            | implemented + tested                                                          |
| `claims-check`: issuer, audience, token use, expiry, scope, group; tokens refused | implemented + tested                                                          |
| `flows`: five application types and a verification checklist                      | implemented + tested (guidance from the Cognito security best practices page) |
| Signature verification, reading users or sessions, creating or resetting users    | not implemented by design                                                     |
| Live inspection through the AWS SDK                                               | not yet implemented                                                           |

## aws-database

| Capability                                                                            | Status                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `model`: key and index coverage, scans, suggested indexes, hot-key and quota warnings | implemented + tested                            |
| `query`: read capacity estimate                                                       | implemented + tested (hand-checked rounding)    |
| `migrate-plan`                                                                        | implemented + tested                            |
| `inspect`: DynamoDB (7 rule ids) and Aurora (4 rule ids)                              | implemented + tested                            |
| Reading rows or table metrics, Aurora Data API, running migrations                    | not implemented by design / not yet implemented |
| Live inspection through the AWS SDK                                                   | not yet implemented                             |

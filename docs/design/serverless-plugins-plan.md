# Plan: the seven serverless plugins

**Status:** proposed, for review before implementation. Inputs: [SERVERLESS_PLUGINS_SPEC.md](../SERVERLESS_PLUGINS_SPEC.md), [CLAUDE.md](../../CLAUDE.md), the code that exists on `main`, and the maintainer's answers of 2026-10-30:

- `aws-guard` is the one guardrail for **anything that touches the account**. `aws-security` is for **auditing security and answering security questions about what is in the account**. They do not overlap.
- Order of work follows dependencies (§5), not the order in the spec.
- Report schemas and plain text/JSON first; the `aws-ui` panel comes after three plugins exist.
- A real AWS account is **not available yet**: real-account verification is planned as optional milestones (§8).

Facts below were checked on 2026-10-30 against Claude Code 2.1.312 and the AWS documentation. Items marked **Verify** are assumptions to confirm during the milestone that depends on them.

## 1. What exists, and where the spec is out of date

The spec (§0) says the repository contains only `aws-context` and `aws-ui`. `main` now has:

| Unit                        | State                           | Relevance to the seven                                                                                                                     |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `aws-context`               | released 0.2.0                  | Verified account, principal, region, profile, environment (`production`/`non-production`/`unknown`), with a background-refreshed snapshot. |
| `aws-ui`                    | released 0.3.0                  | Footer labels and an opt-in status line. No panels.                                                                                        |
| `aws-guard`                 | merged, unpublished             | `PreToolUse` approvals for AWS-changing commands. Never allows.                                                                            |
| `aws-explorer`              | merged, unpublished             | Read-only CloudFormation stacks, resources, events, and Cloud Control properties, with redaction.                                          |
| `packages/context-contract` | internal                        | Snapshot schema, `interpret()`, config trust rule.                                                                                         |
| `packages/aws-client`       | internal                        | STS verification, region resolution, error classes, bounded pagination.                                                                    |
| `packages/testkit`          | internal                        | Hook runner with an isolated HOME, secret detector.                                                                                        |
| Pipeline                    | CI, Changesets, packaging tests | Every plugin is installed from the plugin cache in CI; the Release workflow opens the Version PR itself.                                   |

Conventions to keep: a plugin per `plugins/<name>/`, bundled with esbuild into `dist/`, plain-text output with `--json`, local-first, read-only by default, loopback fake AWS endpoints for tests, no tests against real AWS by default, one PR per step, nothing published until the maintainer asks.

## 2. Decisions

### 2.1 Taken by the maintainer

| #   | Decision                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **One guardrail.** `aws-security` ships **no `PreToolUse` hook**. Anything that decides whether a command may touch the account lives in `aws-guard`. `aws-security` audits, answers security questions about the code and about the account (read-only), and proposes fixes. |
| M2  | **Order by dependency:** Infrastructure → Security → Testing → Deploy → Observability → Cost → Architect.                                                                                                                                                                     |
| M3  | **Schemas and text first.** A report contract and text/JSON output in every plugin. The `aws-ui` panel is built after three plugins use the contract.                                                                                                                         |
| M4  | **No real account for now.** All verification uses fixtures and loopback fakes. Capabilities that need real AWS are marked `implemented + unverified` until a sandbox exists.                                                                                                 |

### 2.2 Changes I make to the spec, and why

| #   | Spec says                                                                                                                                                                         | Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reason                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | `ExecutionContext.environment` is `development \| staging \| production \| unknown`                                                                                               | Use `aws-context`'s `production \| non-production \| unknown`, taken from its `interpret()` result. `identityVerified` is `isCurrent`, never self-asserted.                                                                                                                                                                                                                                                                                                                                                              | The existing trust rule (only the user's file may mark an account non-production) is a safety property. A four-value enum invites guessing from names, which the spec itself forbids.                        |
| S2  | `Finding` has severity and `confidence`                                                                                                                                           | Add `status: confirmed \| hypothesis \| informational`, a stable `ruleId`, a `fingerprint` (for suppressions and diffs), and `source: static \| account \| model`. A finding from a model must be `hypothesis` unless an evidence reference proves it.                                                                                                                                                                                                                                                                   | The spec requires "distinguish confirmed issues from hypotheses" and "never state a root cause without evidence", but its type cannot express either.                                                        |
| S3  | `cdk synth` and `cdk diff` are treated as plain inspection                                                                                                                        | **`cdk synth` runs the project's own code**, which is repository content and untrusted. It runs through a safe tool runner: scrubbed environment (no AWS credentials, no tokens), no shell, timeouts, output caps, `--no-lookups` unless the user opts in to lookups. **`cdk diff` defaults to `--method=auto`, which creates a read-only CloudFormation change set** and uses the deploy role. `aws-infrastructure diff` defaults to `--method=template` and offers `--method=change-set` only after explicit approval. | Verified in the CDK CLI reference. A "read" that executes arbitrary code with the user's credentials, or that creates an AWS artifact, would violate read-only-by-default.                                   |
| S4  | A custom MCP server is allowed "only if materially better"                                                                                                                        | **No custom MCP server in any of the seven for 0.1.** CLI + skills + (four) agents. Revisit for Observability and Cost only if a typed tool measurably beats the CLI.                                                                                                                                                                                                                                                                                                                                                    | Matches the repo so far, avoids a second process model, and keeps each plugin working where MCP is unavailable.                                                                                              |
| S5  | Seven plugins, each with 3–6 commands                                                                                                                                             | Each plugin ships **0.1.0 with the commands that have a real deterministic core**, then grows in 0.2.x. A **capability matrix** per plugin README and a global `docs/capabilities.md` mark every promised capability `implemented + tested`, `implemented + unverified`, or `not yet implemented`.                                                                                                                                                                                                                       | The spec's release gate forbids placeholders. A smaller honest 0.1 beats a wide empty one.                                                                                                                   |
| S6  | `aws-ui` consumes reports through an explicit integration                                                                                                                         | Reports are printed by default and written to disk **only on request** (`--out`). The panel milestone adds an opt-in local report store, private and redacted, with a retention limit, which the `aws-ui` mod reads with `$.fs` like it reads the context snapshot.                                                                                                                                                                                                                                                      | CLAUDE.md: no persistent logs unless the user enables them. Findings can themselves be sensitive.                                                                                                            |
| S7  | `aws-testing` optional hooks for affected tests                                                                                                                                   | **No hook in 0.1.** `run --affected` first. An opt-in `PostToolUse` hook in 0.2 only if it can be debounced and made loop-safe.                                                                                                                                                                                                                                                                                                                                                                                          | A hook that reruns tests on every edit is the noisy loop the spec warns about; prove the command first.                                                                                                      |
| S8  | `aws-deploy` "hooks for preflight/approval"                                                                                                                                       | Approval is **in the CLI**, bound to a plan (§4.5), plus the skill being manual-only and **without `allowed-tools`** so Claude Code always shows the exact command. `aws-guard` covers the `cdk`/`aws` commands it can see; it cannot see a child process started by the deploy CLI, so the CLI enforces its own gates.                                                                                                                                                                                                  | A hook cannot see processes spawned inside another process, and the spec says hooks are not the authority.                                                                                                   |
| S9  | Agents: `serverless-architect`, `serverless-security-reviewer`, `serverless-incident-investigator`, `serverless-cost-analyst`, optional `cdk-reviewer`, optional testing subagent | Build the first four, **each wrapped around a deterministic core**. `cdk-reviewer` and the testing subagent only if an eval shows a gain over the skill alone.                                                                                                                                                                                                                                                                                                                                                           | Agents are for isolation and long evidence synthesis, not for work a script can do. Each agent gets evals (`claude plugin eval` exists in 2.1.312) for grounding, task selection, and permission discipline. |
| S10 | "Share TypeScript packages only where duplication demonstrably exists"                                                                                                            | Four shared packages, each with 3+ consumers (§3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Template analysis, safe output, the report contract, and the tool runner would otherwise be written four times.                                                                                              |

Out of scope, stated so it is not implied: Terraform and SAM (CLAUDE.md lists them as detectable, but this spec is CDK TypeScript), CDK in Python/Java, AppSync depth beyond routing and authorization, and "universal service coverage".

## 3. Architecture

```text
aws-context snapshot ──► every plugin (account, region, environment, verified?)

packages/safe-output       redact · sanitize terminal text · bound sizes        (from aws-explorer)
packages/report-contract   AnalysisReport · Finding · diffs · test/deploy/cost/time-series schemas · text renderer
packages/template-analysis CloudFormation template → inventory · graph · stateful & replacement catalogs · rule engine
packages/tool-runner       child processes: scrubbed env · no shell · timeouts · output caps
packages/aws-client        (exists) STS · region · errors · pagination
packages/context-contract  (exists)

plugins/aws-infrastructure ─► template-analysis, tool-runner, safe-output, report-contract
plugins/aws-security       ─► template-analysis (security rule pack), safe-output, report-contract, aws-client
plugins/aws-testing        ─► tool-runner, template-analysis (assertions), safe-output, report-contract
plugins/aws-deploy         ─► tool-runner, template-analysis, report-contract, aws-client
plugins/aws-observability  ─► aws-client, safe-output, report-contract
plugins/aws-cost           ─► aws-client, template-analysis (inputs), report-contract
plugins/aws-architect      ─► template-analysis (diagram), report-contract

Cross-plugin contact is only through files and documented schemas (a report, an architecture plan), never through shared runtime state.
Each plugin bundles what it needs and works with every other plugin missing.
```

| Package             | First consumers                                            | Notes                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `safe-output`       | explorer, observability, security, deploy, testing         | A move of `aws-explorer`'s redaction, with no change in behavior. Adds log-sample truncation and PII patterns for observability.                                                                                                                                                                                                                                  |
| `report-contract`   | all seven                                                  | Hand-written validators with no dependencies, like `context-contract`, so the future `aws-ui` mod can read reports. `schemaVersion` on every schema, forward-compatible reading, a plain-text renderer used by every CLI.                                                                                                                                         |
| `template-analysis` | infrastructure, security, testing, deploy, cost, architect | Reads synthesized CloudFormation JSON. Resource inventory with logical id, type, and key properties; reference and dependency graph (`Ref`, `Fn::GetAtt`, `DependsOn`, simple `Fn::Sub`/`Join`); catalogs of stateful types and of replacement-causing properties; a rule engine where each rule has a `ruleId`, packs (`iac-quality`, `security`), and evidence. |
| `tool-runner`       | infrastructure (synth), testing, deploy                    | No shell. Environment is an allowlist. Timeouts and output caps. Working directory confined to the project. Returns exit code, bounded output, and what was cut.                                                                                                                                                                                                  |

**Replacement data (Verify in M0).** Whether a property change replaces a resource is published in the CloudFormation resource provider schemas as `createOnlyProperties`. The plan is a build-time script that downloads the schemas for the supported serverless types and writes a committed, dated data file with its source URL. Where a type is conditional or the schema does not say, the analyzer reports `possible replacement`, never `replacement`, unless a change set confirmed it.

## 4. The plugins

Each section lists what 0.1.0 contains, what is deferred, how components map to the spec's commands, and the permissions. All commands are read-only unless stated; anything that writes files writes only on an explicit request and supports `--dry-run`.

### 4.1 `aws-infrastructure`

**0.1.0 commands:** `inspect`, `synth`, `diff`, `review`, `scaffold` (and `init` as part of `scaffold`).

| Command    | Component                   | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inspect`  | CLI + skill                 | Reads `cdk.out` or a template file: inventory, dependency graph, stateful resources, key properties (timeouts, DLQs, retention, encryption). No AWS, no code execution.                                                                                                                                                                                                                                                                                                        |
| `synth`    | CLI + skill                 | Runs `cdk synth` through `tool-runner` (S3), shows only a summary, then runs `inspect`. A failed synth is turned into diagnostics: the file, the construct path when CDK gives one, and the usual cause. Context lookups are opt-in and say which credentials they will use.                                                                                                                                                                                                   |
| `diff`     | CLI + skill                 | Template-vs-template: the synthesized template against a saved baseline or the deployed one (`cloudformation:GetTemplate`, read). Classifies `create`, `update`, `replace?`, `delete`. Flags stateful replacement or deletion, logical-id changes (a delete plus a create of the same type), retention or removal-policy changes, and custom resource changes. `--method=change-set` requires approval, because it creates and deletes a change set, and `aws-guard` will ask. |
| `review`   | skill + `iac-quality` rules | Operational quality of the CDK app: DLQs on queues and event sources, Lambda timeouts and memory, log retention, tags, alarms present, removal policies, unbounded concurrency, stack size and cross-stack coupling. Security rules belong to `aws-security`.                                                                                                                                                                                                                  |
| `scaffold` | skill + templates           | Generates CDK TypeScript for named patterns with secure defaults: queue → Lambda → DynamoDB, HTTP API + Lambda + Cognito JWT, S3 → SQS → Lambda. Lists the files first (`--dry-run`); writes only when asked. Can start from an `ArchitecturePlan` (§4.8) when one exists.                                                                                                                                                                                                     |

**Deferred (0.2+):** `refactor` with logical-id preservation (needs `diff` proven first), drift detection (`DetectStackDrift` creates a request, so it needs approval), CDK version compatibility and upgrade path, bootstrap detection by reading the `CDKToolkit` stack, multi-account comparison, the optional `cdk-reviewer` subagent.

**Permissions:** none for local work. Read: `cloudformation:GetTemplate`, `DescribeStacks`. Change-set method: `cloudformation:CreateChangeSet`, `DescribeChangeSet`, `DeleteChangeSet`.

**Tests:** fixture CDK apps and their synthesized templates (so CI does not run `cdk`); a fake `cdk` executable to test the runner (timeouts, caps, scrubbed env, failure diagnostics); the scenario "queue → Lambda → DynamoDB", "destructive replacement of a table", "failed synth".

### 4.2 `aws-security`

**Scope (maintainer decision M1):** audits and security questions, never a hook. Two layers.

**0.1.0, from code and templates, no AWS:**

| Command | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit` | `security` rule pack over the templates: `*` actions or resources, `iam:PassRole` without conditions, trust policies with `Principal: *` or cross-account without conditions, S3 public access and TLS enforcement, DynamoDB and S3 encryption, KMS key policies, SNS/SQS policies open to `*`, Lambda function URLs with auth `NONE`, secret-looking environment values. Also reads CDK Nag results already present in `cdk.out/manifest.json` annotations when the project uses it, instead of trying to add a dependency. |
| `iam`   | Parses identity, resource, and trust policies (from templates or pasted JSON) for escalation patterns and breadth. Explains an `AccessDenied` message by parsing it (action, resource, principal, and which kind of denial AWS says) and proposes the smallest statement that would fix it, flagged as a proposal.                                                                                                                                                                                                           |
| `auth`  | Route-by-authorizer matrix for HTTP and REST APIs in templates; Cognito/JWT audience and issuer; CORS `*`; unauthenticated sensitive routes.                                                                                                                                                                                                                                                                                                                                                                                 |

**0.2.0, inside the account, read-only (the second half of the maintainer's scope):** `audit --account` with an explicit account and region, bounded and paginated: IAM Access Analyzer findings, S3 account and bucket public-access settings, CloudTrail trail status, KMS key rotation status, Lambda function URL auth, and Security Hub findings when enabled. A question such as "who can read bucket X?" is answered from the bucket policy, the public-access block, and Access Analyzer, and says what it could not see. Findings observed through the API are `confirmed`; conclusions drawn by combining them are `hypothesis`.

**Also 0.2.0:** `threat-model` (deterministic trust-boundary list from the graph, narrated by the agent), `remediate` (a minimal patch with a regression test, never applied automatically), the `serverless-security-reviewer` agent for code-level review (authorization logic in handlers, tenant isolation, secrets in logs) with `file:line` evidence, dependency audit through the project's package manager (a network call to the registry, stated first).

**Exclusions:** `.aws-security.json` (project) and the user file. An exclusion needs `ruleId`, a scope, a reason, and an expiry for anything above `low`. The project file can never suppress `critical` or `high`; only the user file can, and every report lists what was suppressed. Same trust model as `aws-guard`.

**Interaction with `aws-guard`:** none at runtime. A remediation can suggest a guard rule (for example denying `aws iam delete-*`), as text for the user to add.

**Permissions (account mode):** `access-analyzer:ListFindingsV2`, `s3:GetAccountPublicAccessBlock`, `s3:GetBucketPolicyStatus`, `s3:GetBucketPolicy`, `cloudtrail:DescribeTrails`, `GetTrailStatus`, `kms:ListKeys`, `GetKeyRotationStatus`, `lambda:ListFunctionUrlConfigs`, `securityhub:GetFindings`. Each is documented with what it is used for; a denied one is reported as a gap.

**Tests:** fixture templates containing each flaw; negative fixtures that must stay clean; a loopback fake for the account calls; the spec's scenarios "role with excessive permission" and "authenticated API missing auth on a route"; evals for the agent (does not invent findings, labels hypotheses, never edits policy).

### 4.3 `aws-testing`

**Boundary:** testing does not deploy. Integration tests run against stacks that `aws-deploy` (or the user) already deployed, resolving endpoints from stack outputs.

**0.1.0:**

| Command     | What it does                                                                                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`       | Detects Vitest, Jest, or `node:test` from the project; runs all tests or, with `--affected`, those related to changed files (import graph, then naming); returns a structured result (`TestReport`), bounded output, redaction. Runs through `tool-runner`; writes nothing outside the repo.                                                |
| `generate`  | Skill that writes unit tests for Lambda handlers and CDK assertion tests (encryption, IAM actions, DLQ, alarms, retention, removal policy) using the fixtures below and the template inventory. Shows the files first; writes on request.                                                                                                   |
| `contracts` | A library of event fixtures with schemas and malformed variants: API Gateway HTTP v2 and REST v1, EventBridge, SQS (including the `batchItemFailures` response shape), SNS, DynamoDB Streams, S3, Step Functions. Produces fixtures and negative cases for a given handler; property-based cases when the project already has `fast-check`. |
| `coverage`  | Parses the project's coverage output and ties failures and uncovered branches to files and lines. Says plainly that mocks are not AWS integration coverage.                                                                                                                                                                                 |

**0.2.0:** `integration` (opt-in, against an allowlisted non-production account and region verified by STS, with resource, time, and cost limits, teardown of the data the test created, and a status that can be verified), the optional `PostToolUse` affected-test hook (S7).

**0.3.0:** `load` (a bounded generator: rate, concurrency, duration, stop conditions, environment allowlist, never production by default).

**Async scenarios covered by fixtures and generated tests:** duplicate delivery, partial batch failure, out-of-order events, poison messages, DLQ, backpressure.

**Tests:** run the real runner against small fixture projects in each framework; the acceptance example "SQS consumer with duplicate messages and one failing batch member".

### 4.4 `aws-ui` panel (milestone after Testing)

Not one of the seven, but the spec asks for it and decision M3 schedules it here. By then `aws-infrastructure`, `aws-security`, and `aws-testing` all emit `AnalysisReport`. The panel reads an opt-in, private, redacted local report store (S6) with `$.fs`, shows findings and diffs, and offers the same text in `claude -p` where mods do not draw. No panel before this point.

### 4.5 `aws-deploy`

The largest safety surface, so its rules are explicit.

**A deployment is bound to a plan.** `plan` produces a plan record: workspace, account, region, environment and its basis, stack names, a SHA-256 of each synthesized template, the diff summary, destructive items, security-broadening items, and an expiry (default 1 hour). `deploy` takes only a plan id and:

1. re-verifies identity with STS and fails if the account, region, or environment differ from the plan;
2. re-synthesizes and fails if any template hash differs;
3. refuses stages above `non-production` unless `--confirm <account>:<region>:<stacks>` matches the plan exactly (so an approval names what it approves);
4. refuses destructive items and security-broadening changes unless each is acknowledged by name;
5. never uses hotswap for production, warns about drift for development, and never passes `--require-approval never` without steps 3–4 satisfied;
6. runs `cdk deploy` through `tool-runner` with only the credentials the user's environment already holds, streams bounded, redacted events, and ends with a status that was read back from CloudFormation.

The skill is manual-only and has no `allowed-tools`, so Claude Code always shows the user the exact command (S8).

**0.1.0:** `preflight` (identity, bootstrap detection, synth, diff, tests and security results when their reports exist, replacement and deletion risk, environment policy), `plan`, `deploy`, `status` (stack status and events, read-only), `rollback` (plan only: classifies the stack state, identifies irreversible changes, and states the recovery options, such as `ContinueUpdateRollback` for `UPDATE_ROLLBACK_FAILED`; execution is a separate step in 0.2), `pipeline` (generates GitHub Actions with OIDC and a least-privilege role policy, and a CDK Pipelines example; writes on request).

**0.2.0:** rollback execution, change-set-backed plans, Lambda alias and CodeDeploy traffic-shifting detection and guidance.

**What it will not promise:** rollback of DynamoDB or S3 data changes, schema changes, or anything the plan lists as irreversible.

**Tests:** loopback fake CloudFormation (change-set flow, events, failure and `UPDATE_ROLLBACK_FAILED` paths), plan tampering (template changed, account changed, plan expired), the destructive gate, the production confirmation. Real deployment only in the sandbox milestone (§8).

### 4.6 `aws-observability`

**0.1.0:**

| Command       | What it does                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`      | Configuration and recent health of the functions, queues, tables, and APIs of a stack: errors, throttles, duration against the timeout, queue age and DLQ depth.                                                                                                                                                                                                                                            |
| `logs`        | Bounded CloudWatch Logs queries: default 1 hour, at most 24, 200 lines, one query at a time, with a plain statement of the scan cost before running Logs Insights. Redacted and truncated samples.                                                                                                                                                                                                          |
| `metrics`     | A bundle of standard serverless metrics through `GetMetricData`, as a `TimeSeries` with the period and the time range stated.                                                                                                                                                                                                                                                                               |
| `alarms`      | Alarm inventory and bounded state history. Does not create alarms.                                                                                                                                                                                                                                                                                                                                          |
| `trace`       | X-Ray summaries and traces for a bounded window, and whether tracing is enabled at all. Separates observed traces from flow inferred from the template.                                                                                                                                                                                                                                                     |
| `investigate` | The `serverless-incident-investigator` agent over an **evidence ledger**: every claim cites a ledger entry (query, window, result, time); a cause with no entry is written as a hypothesis with the next check that would settle it. The deterministic analyzers (Lambda timeout and out-of-memory signatures in `REPORT` lines, throttling, age and DLQ growth, Step Functions failure history) run first. |

**0.2.0+:** Powertools instrumentation recommendations, SLO and error-budget reports, post-incident review, and an opt-in monitor only if Claude Code's monitor support is confirmed for plugins (**Verify**) and the polling cost can be bounded.

**Boundary with `aws-explorer`:** explorer shows declared and deployed structure; observability shows telemetry. Resolving "which log groups belong to this stack" is done with the same CloudFormation read calls inside observability, without depending on explorer.

**Permissions:** `logs:StartQuery`, `GetQueryResults`, `FilterLogEvents`, `DescribeLogGroups`, `cloudwatch:GetMetricData`, `DescribeAlarms`, `DescribeAlarmHistory`, `xray:GetTraceSummaries`, `BatchGetTraces`, `lambda:GetFunctionConfiguration`, `sqs:GetQueueAttributes`, `states:ListExecutions`, `DescribeExecution`, `GetExecutionHistory`, and the stack read calls. Costs documented per command.

**Tests:** loopback fakes for CloudWatch, Logs, X-Ray, SQS, and Step Functions; fixtures for a Lambda timeout, an SQS backlog with an unhealthy consumer, a failing execution, and missing instrumentation; paginated and throttled responses.

### 4.7 `aws-cost`

**Never mixes the three numbers.** Every figure is labeled `estimated` (computed from stated inputs and a dated rate), `forecast` (a scenario under stated assumptions), or `actual` (read from billing data, with its data latency), and each report carries its date and exclusions (credits, free tier, tax, support).

**Pricing data (Verify in M6).** The AWS Price List bulk files are public over HTTPS, so estimates work **without an account or credentials**. The plugin fetches only the regional files for the services it needs, caps their size, caches them with their publication date, and states that date. No bundled price table, which would go stale.

**0.1.0:** `estimate` (workload inputs, or taken from the template inventory with the missing inputs asked for: requests, duration, memory, data volume, retries, workflow transitions, region), `compare` (Lambda memory sizes, HTTP vs REST API, DynamoDB on-demand vs provisioned, Step Functions Standard vs Express, SQS vs EventBridge, log retention), both with a sensitivity table.

**0.2.0:** `analyze` (Cost Explorer, read-only), `optimize` (recommendations from measured evidence such as Lambda max memory used versus configured, log group retention, and unused provisioned concurrency, each with its reliability trade-off), `budgets` (inventory and suggested thresholds), and the `serverless-cost-analyst` agent.

**Cost Explorer is billed per paginated request** (the AWS documentation says $0.01 per request and warns specifically about agents). So `analyze` takes an explicit **query budget** (default 5 requests), shows it before running, groups to the coarsest dimension that answers the question, stops at the budget, and reports attribution gaps (untagged spend, services without resource-level data) instead of inventing per-resource figures. Data lags by up to about a day, which is stated.

**Permissions:** `ce:GetCostAndUsage`, `ce:GetDimensionValues`, `budgets:ViewBudget`, plus the observability reads for optimization evidence. A denied call produces a clear "insufficient permission" report with no numbers.

**Tests:** unit tests of every formula against fixture price files, a golden estimate for "API + Lambda + DynamoDB", Step Functions variants, a loopback Cost Explorer fake including pagination and the query budget, and the "log-ingestion spike" scenario.

### 4.8 `aws-architect`

Last, because it is the least deterministic and reuses the graph.

**0.1.0:** skills `design`, `review`, `diagram`, `compare`, `evolve`, and the `serverless-architect` agent, all built on real artifacts so it is not "just an agent":

- **Requirements intake** with a schema (traffic and peak concurrency, latency and SLO, consistency, retention, residency, tenancy, RTO/RPO, team constraints) and a list of what is still missing, instead of designing from guesses.
- **`diagram`** produces Mermaid from the template graph with every edge labeled `declared` (in the template) or `inferred`; from requirements alone it produces a conceptual diagram, labeled as such.
- **ADR generator** (MADR format) and the architecture documents of the spec (`docs/architecture/overview.md`, `decisions/*.md`), written **only on request**.
- **Decision tables** as data files (service integration vs Lambda, HTTP vs REST vs GraphQL, sync vs async, SNS/SQS/EventBridge, Standard vs Express), each row with its criteria, the official source URL, and the date reviewed. Quotas are cited from the documentation with "verify in Service Quotas", not copied as facts.
- **Well-Architected and Serverless Lens checklist** as a curated data file with source links; a review reports which questions are answered by the evidence in the project and which are not, and never invents a finding.
- **`ArchitecturePlan` v1:** a small versioned handoff (components, integrations, assumptions, risks, open questions) that `aws-infrastructure scaffold --from-plan` can read. Each plugin works without the other.

**Evals:** the four design examples of the spec (authenticated API, S3 ingest pipeline, fan-out workflow, multi-tenant SaaS API) graded on failure paths, trade-offs, citations, and the absence of invented numbers.

## 5. Milestones and order

Sizes are relative effort (S, M, L), not calendar time. Every step is one PR, merged when CI is green, and nothing is published until the maintainer asks.

| Step | Work                                                                                                                                                                                                       | Size | Exit criterion                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| M0.1 | Extract `safe-output` from `aws-explorer`                                                                                                                                                                  | S    | Explorer tests unchanged and green                                                                                      |
| M0.2 | `report-contract` (AnalysisReport, Finding, ExecutionContext from `interpret()`, text renderer) with tests                                                                                                 | M    | Round-trip, forward-compatible read, rejects hostile input                                                              |
| M0.3 | `template-analysis`: parser, inventory, graph, catalogs (replacement data from provider schemas), rule engine                                                                                              | L    | Fixture corpus analyzed with no crash; every catalog row has a source and a date                                        |
| M0.4 | `tool-runner`                                                                                                                                                                                              | S    | Scrubbed env, timeout, cap, no shell, confinement, all tested with a fake executable                                    |
| M0.5 | Fixture corpus: CDK TypeScript sources and their synthesized templates for the scenario matrix; **guard update** so `cdk diff` without `--method=template` counts as a change; `docs/capabilities.md` stub | M    | Guard table tests updated; fixtures reproducible                                                                        |
| M1   | `aws-infrastructure` 0.1.0                                                                                                                                                                                 | L    | Release gate (§7); scenarios: queue → Lambda → DynamoDB, destructive replacement, failed synth                          |
| M2   | `aws-security` 0.1.0, then 0.2.0                                                                                                                                                                           | L+M  | Scenarios: excessive-permission role, missing auth route; 0.2.0 adds the account mode on loopback fakes                 |
| M3   | `aws-testing` 0.1.0                                                                                                                                                                                        | L    | Scenario: SQS duplicates and partial batch failure; CDK IAM assertions                                                  |
| M3.5 | `aws-ui` report panel (minor release of `aws-ui`)                                                                                                                                                          | M    | Panel renders reports from three plugins; text fallback in `-p`                                                         |
| M4   | `aws-deploy` 0.1.0                                                                                                                                                                                         | L    | Plan tampering and gates tested; production confirmation; rollback plan names irreversible changes                      |
| M5   | `aws-observability` 0.1.0                                                                                                                                                                                  | L    | Scenarios: Lambda timeout, SQS backlog, failing Step Functions execution; every agent claim traceable to a ledger entry |
| M6   | `aws-cost` 0.1.0, then 0.2.0                                                                                                                                                                               | M+M  | Golden estimates; Cost Explorer budget stops at the limit; insufficient-permission path                                 |
| M7   | `aws-architect` 0.1.0                                                                                                                                                                                      | M    | The four design examples pass their evals                                                                               |
| M8   | 0.2.x second pass across plugins; the cross-plugin scenario matrix as integration tests and evals; the final capability matrix                                                                             | L    | Every row of the spec's §9 matrix has a fixture-backed test or an explicit gap                                          |

Dependencies in one line: `template-analysis` and `report-contract` feed everything; Security, Testing, and Deploy consume Infrastructure's analysis; Deploy consumes Security and Testing reports when present; Architect consumes the graph; the panel consumes three plugins.

## 6. Test and evaluation strategy

- **Unit tests** for every non-model rule: parsers, rule packs, formulas, gates.
- **Fixtures first:** a realistic CDK app and its template for each scenario of the spec's §9, plus the error fixtures the spec lists: expired SSO, access denied, absent AWS CLI or `cdk`, no account, unsupported region or service, throttling, paginated data, missing instrumentation, and failed or partial CloudFormation operations.
- **Loopback fakes** (the pattern already used by `aws-context` and `aws-explorer`) for STS, CloudFormation, Cloud Control, CloudWatch, CloudWatch Logs, X-Ray, SQS, Step Functions, and Cost Explorer. A fake records the calls it receives, and the test asserts that only the documented read calls were made.
- **Bundled-artifact tests** run the built CLI exactly as installed, and the packaging test installs each plugin from the plugin cache.
- **Agent evals** with `claude plugin eval`: for each of the four agents, cases for grounding (cites evidence, labels hypotheses), task selection (delegates only when worthwhile), and permission discipline (refuses to change AWS). They make real model calls, so they run on demand or nightly by the maintainer, not on every PR, with a cost ceiling. Whether CI runs them depends on an API key secret the maintainer would have to provide.
- **No real AWS** in any default run. **Verify:** none of the above has been run yet; this section is the plan.

## 7. Release gate per plugin

Adapted from the spec's §10 and CLAUDE.md. A plugin is released only when:

1. its manifest passes `claude plugin validate --strict` and it installs from the plugin cache in CI;
2. its commands are discoverable and one representative fixture works end to end;
3. error paths are covered: no credentials, expired session, access denied, throttling, missing tool, partial data;
4. identity is verified with STS before any AWS call that depends on the account, and unverified context is shown plainly;
5. no secret appears in any output, fixture, or report (`findSecretLikeStrings`), and nothing is written to AWS or to disk by default;
6. its README states the quick start, the exact permissions, costs of AWS API use, limits, supported versions, and a capability matrix with the three statuses;
7. text output works with `aws-ui` and every optional plugin absent;
8. at least one scenario-specific integration test or eval passes;
9. nothing unsupported is claimed, and anything that needs a real account is marked `implemented + unverified`.

## 8. Verification with a real account (optional, later)

Per decision M4, none of these is required for a release, but each unlocks `implemented + tested` for capabilities that today can only be `implemented + unverified`:

| Milestone | Needs                                                                                                                                                | Unlocks                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| V1        | A disposable sandbox account with a read-only role (the OIDC setup in `docs/security-model.md`), run manually or by the `aws-sandbox` CI environment | Explorer, Infrastructure drift and `GetTemplate`, Security account mode, Observability reads, Cost Explorer |
| V2        | The same account with a deploy role limited to a test stack prefix, a budget alarm, and an auto-teardown                                             | Deploy, change-set diff, Testing `integration`, rollback paths                                              |
| V3        | A small deployed workload with logs and traces                                                                                                       | Observability investigations and Cost optimization on measured data                                         |

Each runs from an explicit command or workflow with a stated cost ceiling, never by default.

## 9. Risks

| Risk                                                                         | Mitigation                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cdk synth` runs untrusted project code                                      | S3: scrubbed environment, no credentials by default, timeouts, caps, an explicit opt-in for lookups, and a README warning. It cannot be sandboxed further by a plugin. |
| Replacement data is wrong or incomplete                                      | Dated catalog with sources; "possible replacement" unless a change set confirms; fixtures for the known cases.                                                         |
| Rule packs become a pile of unverified opinions                              | Each rule has an id, a rationale, a source link, and a positive and a negative fixture; the same format for every pack.                                                |
| Agents overclaim                                                             | Evidence ledger, `hypothesis` as the default status for model output, and evals that fail on uncited claims.                                                           |
| Deploy approvals approve the wrong thing                                     | The plan binding (hashes, account, region, expiry) and the `--confirm` string that names the target.                                                                   |
| Cost Explorer or Logs Insights charges surprise the user                     | A visible budget before every billed query, a default far below what would hurt, and the cost stated in every README.                                                  |
| Scope: seven plugins is a large surface                                      | Thin vertical slices, an honest capability matrix, and the order in §5 so that every step is usable without the next.                                                  |
| Claude Code behavior assumed but unconfirmed (`async` hooks, monitors, mods) | Each is marked **Verify** where it matters, with a fallback that needs none of them.                                                                                   |

## 10. Open items

- **Pricing source (Verify in M6):** the public Price List bulk files are the plan; the alternative is the official pricing MCP server, which would add a dependency this plan avoids.
- **Evals in CI:** needs an API key secret and a cost ceiling the maintainer must choose.
- **Monitors for Observability:** depend on Claude Code plugin support that has not been confirmed.
- **YAML templates:** `cdk.out` is JSON; hand-written YAML or SAM templates are out of scope until asked for.
- **Naming:** the plugin names follow the spec (`aws-infrastructure`, `aws-security`, ...) and the existing `aws-` prefix.

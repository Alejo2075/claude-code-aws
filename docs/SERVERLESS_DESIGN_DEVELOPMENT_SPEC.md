# AWS Serverless Design & Development — Unified Plugin Specification

**Status:** Target implementation and migration specification; not evidence that new capabilities exist.  
**Version:** 2.0  
**Date:** 2026-10-30  
**Primary stack:** Claude Code plugins, TypeScript, Node.js, AWS SDK for JavaScript v3, AWS CDK v2 with TypeScript.  
**Scope:** **Two categories: Design (5 plugins) and Development (14 plugins).**  
**Implementation target:** **17 new plugins**; refactor ownership in **2 existing Design plugins**. Retain the other **9 existing plugins** unchanged unless a narrowly scoped integration or compatibility fix is required.  
**Marketplace target:** **28 total plugins**: 11 previously developed + 17 new (subject to checking the actual repository).

## 0. Mission, instructions and non-goals

Build a complete but understandable AWS serverless developer experience for Claude Code. Use one independently installable plugin per cohesive capability, not one plugin per implementation mechanism. **Design** owns architectural decisions, diagrams, proof-of-concept orchestration and holistic review; **Development** owns the behavior and developer tooling for specific AWS service groups.

**Read this entire specification before coding.** Then inspect the real repository, `AGENTS.md`, `CLAUDE.md`, plugin manifests, skills, agents, MCP registrations, hooks/mods, packages, scripts, tests and documentation. Treat statements that plugins already exist as user-reported inventory, not proof of specific implementations. Confirm what is actually shipped and working.

**Important migration instruction:** If an existing plugin contains functionality now assigned to a new plugin, **extract it to the new owner**, preserve working functionality, migrate tests and documentation, and deprecate or forward old commands where feasible. **Do not delete code before verifying parity.** Never remove a generic helper that the old plugin still legitimately owns.

**Not in scope:** a hosted AWS control plane, storing AWS credentials, replacing the CDK/AWS SDK/AWS Console, building a new generic multi-service API gateway, claiming compatibility with untested Claude Code/AWS versions, or deploying/altering AWS resources automatically.

### Canonical product inventory

**Existing plugins (11; inspect before modifying):**

`aws-context`, `aws-ui`, `aws-guard`, `aws-explorer`, `aws-architect`, `aws-infrastructure`, `aws-security`, `aws-testing`, `aws-deploy`, `aws-cost`, `aws-observability`.

**New Design plugins (3):** `aws-diagrams`, `aws-prototyping`, `aws-well-architected`.

**New Development plugins (14):** `aws-lambda`, `aws-api`, `aws-auth`, `aws-events`, `aws-messaging`, `aws-workflows`, `aws-database`, `aws-storage`, `aws-streaming`, `aws-edge`, `aws-ai`, `aws-containers`, `aws-email`, `aws-config`.

**Definition of scope:** The two Design plugins `aws-architect` and `aws-infrastructure` already exist, but their **ownership and public integration must be updated**; the other seventeen plugins are **new implementations**.

## 1. Two categories, 19 plugins

### 1.1 Design — five independent plugins

| Plugin                 | State              | Sole core responsibility                                                                         | Primary extension types                             |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `aws-architect`        | Existing; refactor | Requirements, architectural options, service selection, ADRs and implementation planning         | Specialist agent + skills                           |
| `aws-infrastructure`   | Existing; refactor | CDK v2 TypeScript apps, constructs, stacks, synth/diff, resource graph data and safe refactoring | Skills + CLI analyzers + optional typed MCP         |
| `aws-diagrams`         | **NEW**            | Generate, validate, maintain and export architecture, infrastructure and event/workflow diagrams | Skills + TypeScript graph transforms + optional MCP |
| `aws-prototyping`      | **NEW**            | Produce bounded functional PoCs, experiment plans and evidence before production engineering     | Skills + CLI + optional focused agent               |
| `aws-well-architected` | **NEW**            | Workload assessment and improvement backlog across all six pillars with serverless lens          | Review agent + skills + assessment engine           |

### 1.2 Development — fourteen independent plugins

| Plugin           | AWS focus                                     | Sole core responsibility                                              | Primary extension types                |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| `aws-lambda`     | Lambda                                        | Function code, runtime configuration and invocations                  | Skills + SDK/CLI + optional MCP        |
| `aws-api`        | API Gateway; AppSync GraphQL                  | Client-facing APIs, protocols and contracts                           | Skills + schema tooling + optional MCP |
| `aws-auth`       | Cognito                                       | User identity, sign-in, tokens, federation and application auth flows | Skills + SDK tooling                   |
| `aws-events`     | EventBridge; Scheduler                        | Event routing, buses, rules and scheduling                            | Skills + SDK/MCP                       |
| `aws-messaging`  | SQS; SNS                                      | Queues, topics, subscriptions and reliable delivery                   | Skills + SDK/MCP                       |
| `aws-workflows`  | Step Functions                                | State-machine orchestration and execution lifecycle                   | Skills + ASL tooling + SDK/MCP         |
| `aws-database`   | DynamoDB; Aurora Serverless                   | Database modeling, indexes, queries and data operations               | Skills + SDK/MCP                       |
| `aws-storage`    | S3; EFS                                       | Object/file storage, transfers and storage access                     | Skills + SDK/MCP                       |
| `aws-streaming`  | Kinesis; Amazon Data Firehose                 | Continuous ingest, stream consumers and delivery                      | Skills + SDK/MCP                       |
| `aws-edge`       | CloudFront; CloudFront Functions; Lambda@Edge | CDN configuration, cache semantics and edge logic                     | Skills + test utilities + SDK          |
| `aws-ai`         | Bedrock; AgentCore                            | Generative AI applications, RAG and agent integrations                | Focused agent + skills + SDK/MCP       |
| `aws-containers` | ECS Fargate; ECR                              | Container applications and image/task lifecycle                       | Skills + Docker/SDK/CLI                |
| `aws-email`      | SES                                           | Application email delivery, receiving and reputation                  | Skills + SDK/MCP                       |
| `aws-config`     | AppConfig; SSM Parameter Store                | Runtime settings, feature flags and non-secret parameters             | Skills + SDK/MCP + optional hooks      |

**Service naming:** Amazon Data Firehose is the current branding; support AWS SDK and CLI identifiers that still use `firehose`.

## 2. Strict responsibility and non-overlap rules

Each plugin may **consume** data from adjacent plugins but may not duplicate their authoritative behavior. Plugins are installable separately and must degrade gracefully if optional siblings are absent.

| Capability                                                                           | Sole owner                       | Explicitly excluded from neighboring plugins                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Requirements, architecture selection, ADRs, target-state plan                        | `aws-architect`                  | No final diagram rendering, multi-pillar audit, PoC runner or CDK lifecycle                                         |
| CDK stacks, constructs, synth, diff, drift and IaC refactors                         | `aws-infrastructure`             | No prototype orchestration, image export, official workload-level Well-Architected assessment or deploy execution   |
| Diagrams, layout, export, graph transformation and diagram source files              | `aws-diagrams`                   | Architect and Infrastructure produce structured facts, not a competing diagram engine                               |
| PoCs, experiments, comparison of approaches, prototype acceptance and promotion plan | `aws-prototyping`                | Doesn't take ownership of ordinary CDK scaffolding, test suites, deployment approvals or feature-specific SDK tools |
| Six-pillar workload review, gap scoring and prioritized improvement plan             | `aws-well-architected`           | Security/Cost/Observability remain owners of in-depth domain investigations                                         |
| Verified AWS identity and account/region                                             | `aws-context`                    | No plugin guesses identity from a profile name                                                                      |
| UI mods, status line, interactive panels and diagram presentation                    | `aws-ui`                         | `aws-diagrams` supplies source and structured graph; UI renders through supported interfaces only                   |
| General AWS inventory/discovery                                                      | `aws-explorer`                   | Development plugins inspect only their domain's deeper semantics                                                    |
| Preventive operation policies                                                        | `aws-guard` + actual AWS IAM/SCP | No plugin bypasses guards; hooks are not the sole security perimeter                                                |
| Security posture, IAM audit, authz threat analysis                                   | `aws-security`                   | Well-Architected consumes findings without cloning the entire audit engine                                          |
| Tests, assertions, suites, integration runs                                          | `aws-testing`                    | Prototyping creates bounded experiments/fixtures, not its own complete test framework                               |
| Authorized deploy, CI/CD, rollback                                                   | `aws-deploy`                     | Prototyping may request a sandbox deploy through Deploy, but never runs an independent prod rollout                 |
| Prices, cost history, budget, detailed optimization                                  | `aws-cost`                       | Well-Architected reviews cost pillar and reuses Cost evidence                                                       |
| Metrics/logs/traces, incidents and alarms                                            | `aws-observability`              | Well-Architected reviews operational evidence without taking ownership of telemetry queries                         |
| APIs/routes/contracts                                                                | `aws-api`                        | Auth plugin owns identity flows; Lambda plugin owns handler behavior                                                |
| App sign-in, user pools, tokens                                                      | `aws-auth`                       | API only attaches authorizers or checks integration                                                                 |
| EventBridge routing                                                                  | `aws-events`                     | Queues/topics belong to Messaging; state machines belong to Workflows                                               |
| SQS/SNS delivery and fan-out                                                         | `aws-messaging`                  | Not bus routing nor Step Functions orchestration                                                                    |
| Step Functions ASL and execution                                                     | `aws-workflows`                  | Not SQS/SNS/EventBridge provisioning semantics                                                                      |
| DynamoDB/Aurora records and indexes                                                  | `aws-database`                   | S3/EFS are Storage                                                                                                  |
| Secrets Manager/KMS/security policy                                                  | `aws-security`                   | Config owns runtime non-secret parameters and flag behavior                                                         |
| SES message delivery and reputation                                                  | `aws-email`                      | SNS transport remains Messaging when used by SES events                                                             |

### Cross-plugin portability

- Don't assume a skill can directly invoke a sibling's private script or read its private runtime state. Verify available tools and documented dependency contracts.
- If the receiving plugin isn't installed, produce an honest text artifact and an optional manual next step; don't silently install plugins or imitate privileged actions.
- If typed artifacts are required across packages, define a small **versioned public schema**, serialize over an explicitly supported channel, and validate before use.
- Shared packages are a source-code optimization only; installable plugins must include their built dependencies. No unresolved `../../packages` runtime paths in installed copies.
- Every plugin must remain useful with `aws-ui` absent, and must never need a hosted backend.

## 3. Mandatory extraction and migration from existing plugins

This is an **implementation requirement**, not an instruction to delete files based on filenames. Inspect real code first and prepare an inventory of functions, commands, imports, tests and consumers. Define an extraction map and migration tests before editing.

| Existing plugin / legacy capability                                                         | New canonical owner    | What stays in the original plugin                                                                | Migration requirement                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aws-architect`: `diagram` skill, Mermaid generation, architecture visualization            | `aws-diagrams`         | Service selection, architecture descriptions, requirements, ADRs, compare/evolve                 | Move diagram-generation code, templates and fixtures; deprecate/forward old command when possible                                                 |
| `aws-architect`: Well-Architected six-pillar review, scoring and assessment reports         | `aws-well-architected` | General architectural review, tradeoffs and design risk commentary                               | Move formal assessment rubrics, evidence logic, reports and tests; architecture review becomes a design review, not official pillar certification |
| `aws-architect`: prototype generation, proof-of-concept orchestration (if present)          | `aws-prototyping`      | Implementation plan and architecture recommendations                                             | Move PoC orchestration and samples; keep references to expected prototype interfaces                                                              |
| `aws-infrastructure`: diagrams and diagram exporting (if present)                           | `aws-diagrams`         | CDK synthesis, logical resource relationships/typed graph, stack inventory, synth/diff, refactor | Retain graph extraction as source data; extract final diagram layout, file exporters and rendering                                                |
| `aws-infrastructure`: multi-service PoC workflow, experiment comparisons (if present)       | `aws-prototyping`      | Ordinary `cdk init`, stack/construct scaffolding and analysis                                    | Transfer experiment lifecycle; retain general IaC scaffolding and reusable build utilities                                                        |
| `aws-ui`: diagram-generation internals, if present                                          | `aws-diagrams`         | Pure visual presentation, supported mod panels and fallback render                               | Keep UI consumer; separate graph/layout/diagram export from presentation while preserving existing panels                                         |
| `aws-security`, `aws-cost`, `aws-observability`: generic six-pillar coordinator, if present | `aws-well-architected` | All specialist audits, costs, traces and their original reports                                  | Extract only umbrella workflow; retain and expose existing domain evidence producers                                                              |
| `aws-testing`/`aws-deploy`: ad-hoc PoC runner, if present                                   | `aws-prototyping`      | Generic test execution, sandbox safety approvals, official deployment execution                  | Transfer experiment state machine and promotion report, keep trusted test/deploy engines                                                          |

**Safety rule for existing users:**

1. Add the new plugin and its tested implementation first.
2. Migrate code and test coverage; preserve existing public commands as compatibility shims with a clear deprecation note where possible.
3. Only remove duplicate internals after new tests pass, all references are updated, and fallbacks are verified.
4. Do not force installing a new plugin just to keep an old plugin's unrelated functionality working. A deprecated command may show a migration instruction if delegation is not technically supported.
5. Preserve saved user data and output files. Never destructively rewrite user architecture documents without an explicit request.
6. Produce `docs/plugin-ownership-migration.md` with _before / after / files changed / compatibility / test evidence / known gaps_.
7. If a feature is not present in the existing code, mark **not present**; don't invent a migration.

## 4. Simple, consistent developer experience

- Maximum of **3–6 primary namespaced commands/skills** per plugin. Advanced controls are flags, optional skills or documented arguments, not dozens of one-off commands.
- An installable plugin should work after minimal setup; inspect credentials via the default credential chain and `aws-context` when available.
- Always show account, region, environment, resource scope, time of observation and whether result came from _code_, _live AWS_, _fixture_, _simulation_ or _estimate_.
- For write/expensive operations: present the exact plan, AWS account/region/resources, expected costs/side effects and rollback limits **before** requesting explicit approval.
- Simple textual summary first; optional evidence-rich files and structured JSON for tools and `aws-ui`.
- Read-only default for real AWS. No live mutations or artificial cost-incurring actions from an auto-invoked agent, skill or hook.
- Use AWS SDK v3/CDK/CLI directly when the task is straightforward. Create MCP servers only when typed capabilities offer genuine value.
- Hooks should be narrow and deterministic; don't poll AWS, start workloads or scan whole repositories in every prompt/tool event.
- Ensure graceful errors for expired SSO sessions, missing permissions, wrong regions, absent binaries, service quotas and incomplete context.

### 4.1 Proposed structured result contract (adapt to actual repository)

```ts
type PluginResult<T> = {
  schemaVersion: 1;
  plugin: string;
  operation: string;
  source: "local-code" | "aws-api" | "fixture" | "simulation" | "estimate";
  observedAt: string;
  accountId?: string;
  region?: string;
  status: "success" | "partial" | "blocked" | "failed";
  data?: T;
  findings?: Array<{
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    evidence?: string[];
    recommendation?: string;
  }>;
  warnings?: string[];
};
```

This is an internal design suggestion, not a built-in Claude Code data interface. A schema may be stored in a shared package, but every plugin must bundle its runtime dependencies and validate version compatibility.

### 4.2 Proposed architecture handoffs

```text
aws-architect        -> ArchitecturePlan + ADRs + service graph data
aws-infrastructure   -> CDK/CloudFormation resource graph + diff/inspection data
aws-diagrams         -> Mermaid source + versioned DiagramArtifact + optional SVG/PNG
aws-prototyping      -> PrototypeManifest + experiments + evaluation + promotion plan
aws-well-architected -> Evidence-backed six-pillar review + risk/improvement backlog
aws-ui               -> Render supported diagrams/charts/panels from public outputs
aws-deploy           -> Execute approved cloud deploy/cleanup based on reviewed plan
```

No hard-coded shared memory or fabricated IPC. Detect and use only interfaces that actually exist or build documented, versioned interfaces and tests.

## 5. Design — detailed specifications for five plugins

### 5.1 `aws-architect` (EXISTING: narrow and strengthen)

**Owner:** Architecture requirements, service-selection logic, tradeoffs, ADRs, target-state design and implementation plans. **Does not own** rendering diagrams, running PoCs, formal Well-Architected reviews, CDK infrastructure implementations or deployment.

**Extension types:** `serverless-architect` subagent + skills; optional verified AWS documentation lookup. No custom MCP server unless typed design-data operations have a measurable benefit.

**Core capabilities:**

- Translate ambiguous ideas into bounded functional and nonfunctional requirements: latency/SLO, throughput, concurrency, tenancy, retention, consistency, RTO/RPO, geographic/sovereignty, cost and maintenance.
- Greenfield, brownfield, modernization, multi-account and multi-region design; identify source assumptions and gaps.
- Choose direct service integration vs Lambda, API Gateway types, synchronous vs asynchronous patterns, EventBridge vs SQS vs SNS, Step Functions Standard vs Express, relational vs DynamoDB based on evidence.
- Design event boundaries, idempotency, retries, ordering, failure handling, observability expectations and isolation of sensitive data.
- Compare viable alternatives with explicit tradeoffs, not fictional numbers or indiscriminate Lambda usage.
- Generate architecture design specification, service graph data, ADRs, acceptance criteria and implementation plan consumable by Infrastructure/Development.
- Link to `aws-diagrams` for render/export and `aws-well-architected` for formal six-pillar review when installed, without duplicating their logic.

**Primary skills:** `design`, `compare`, `review`, `evolve`, `plan`.

**Example outputs:** `docs/architecture/overview.md`, `docs/architecture/decisions/*.md`, `docs/architecture/implementation-plan.md`, versioned `ArchitecturePlan.json` (only when requested to write files).

**Definition of done:** design authenticated API + DynamoDB, queue-driven worker, EventBridge fan-out and Step Functions workflow; clearly explain why services were chosen, including at least one rejected option and failure scenarios. Ensure old diagram/Well-Architected command pathways are migrated or deprecated with tested behavior.

### 5.2 `aws-infrastructure` (EXISTING: narrow and strengthen)

**Owner:** AWS CDK v2 TypeScript source-of-truth, constructs, stacks, synth, CDK diff, CloudFormation analysis/drift and safe refactoring. **Does not own** architectural strategy, final diagrams, prototype lifecycle, formal six-pillar review, deploy or cloud rollback.

**Extension types:** Skills + packaged TypeScript CLI and/or typed local MCP; optional IaC reviewer for complex diffs; no required UI.

**Core capabilities:**

- `cdk init`/project scaffolding, L2/L3 constructs and production-quality stack patterns, tags and removal policies.
- Multi-stack, multi-stage, multi-account/region setups; asset bundling, context lookups, dependency and logical ID stability.
- Static/compiled inspection of CloudFormation resources and dependencies from `cdk synth`, with schema for a graph producer.
- CDK synth, diagnostics, diff, drift assessment and replacement/deletion risk evidence. Distinguish change-set-backed conclusions from template-only uncertainty.
- Resource refactoring with logical ID preservation and migration warning; no implicit CloudFormation replacements.
- Produce structured `ResourceGraph`, `InfrastructureDiff`, risk report and code changes that downstream tools can use.
- `aws-diagrams` owns diagram output and rendering; `aws-prototyping` owns quick experiment orchestration; `aws-deploy` owns authorized deployments.

**Primary skills:** `init`, `scaffold`, `inspect`, `diff`, `refactor` (synth/validate callable within inspect and diff).

**Definition of done:** handle an existing CDK TS app, a multi-stack app, a failed synth, stack replacement, drift and refactor. Resource graph extraction must remain useful without `aws-diagrams` installed. Preserve independent installation.

### 5.3 `aws-diagrams` (NEW)

**Owner:** Diagram source generation, architecture modeling, graph normalization/layout, validation, update and export. **Not** the CDK generator, the architecture decision maker or the Claude Code UI owner.

**Extension types:** Skills + TypeScript graph/diagram transformations + optional local MCP providing `diagram.generate`, `diagram.validate`, `diagram.export` and `diagram.diff` as typed operations if worthwhile. Render through `aws-ui` when available. No specialist agent needed initially.

**Core capabilities:**

- Generate editable diagrams from (a) explicit user requirements, (b) architecture artifacts, (c) CDK synthesized resource graph, (d) live inventory when user authorizes scoped reads.
- Diagram types: high-level solution architecture, service dependency graph, data flow, trust boundaries, event bus/queue processing, Step Functions state graph, deployment topology and before/after architecture delta.
- Export Mermaid source as the default, with optional SVG/PNG using verified local rendering tools. Preserve source even when raster export is unavailable.
- Validate node/edge referential integrity, DAG when required, cycles where legal, direction, completeness and sensitive-label redaction.
- Distinguish _intended_, _declared_, _deployed_ and _observed_ topology; annotate partial/inferred edges and confidence. Never hallucinate exact deployed resources.
- Update a diagram incrementally from structured changes with stable IDs; avoid regenerated layouts that needlessly shuffle everything.
- Offer text-only summaries and paths when `aws-ui` is not installed.

**Primary skills:** `generate`, `from-cdk`, `from-aws`, `update`, `export`.

**Example files:** `docs/architecture/diagrams/*.mmd`, `*.svg` if requested, plus a portable `DiagramArtifact.json` when machine consumers need it.

**Required acceptance scenarios:** API Gateway → Lambda → DynamoDB; EventBridge → SQS → Lambda + DLQ; Step Functions workflow; multi-stack CDK; cross-account connection; comparing as-is to to-be; missing AWS permission; no UI or renderer binary. Diagram source must be stable, valid and editable.

### 5.4 `aws-prototyping` (NEW)

**Owner:** Rapid, disposable prototypes and proof-of-concept lifecycle; controlled experiments, assumptions, alternatives and readiness to promote into maintained product code. **Not** the general CDK scaffolder, test runner or deploy authority.

**Extension types:** Skills + TypeScript CLI generators/validators + optional focused `prototype-engineer` agent for experiment design (not required initially). Reuse `aws-infrastructure`, `aws-testing`, `aws-deploy` and AWS Solutions Constructs where actually available; keep a useful no-dependency local mode.

**Core capabilities:**

- Start from an idea, architecture plan, source repo or selected serverless pattern; generate a _minimal_ PoC manifest and files designed to answer a specific engineering question.
- Catalog compact examples: API Gateway + Lambda + DynamoDB; EventBridge + SQS + Lambda; S3 ingestion; Step Functions workflow; Cognito-authenticated API; Bedrock request/response; optional SES event flow.
- Record hypothesis, success metric, estimated usage, permissions, assumptions, decision deadline, cleanup needs and blast radius **before** experimentation.
- Provide local/mock-first experiments and deterministic example fixtures; record observed vs simulated results separately.
- Compare two alternatives with the same input/metrics and a written tradeoff report; avoid claiming statistically significant performance without adequate samples.
- With explicit approval and a dedicated sandbox AWS account, request **aws-deploy** to execute a scoped temporary deployment; never implement a second rollout engine. If Deploy isn't installed, produce an executable-by-human deployment plan instead.
- Safe cleanup plan, orphan detection, ownership tags and protected-resource checks; no silent teardown or time-based destructive process.
- Convert a successful experiment into an implementation backlog and handoff to Architect/Infrastructure/Development; eliminate throwaway shortcuts and secrets before promotion.

**Primary skills:** `start`, `experiment`, `compare`, `validate`, `promote`, `cleanup-plan`.

**Example files:** `prototypes/<slug>/prototype.yaml`, `README.md`, `experiment-results.json`, `promotion-plan.md` and optional code. Never overwrite application source or commit secrets.

**Acceptance scenarios:** local PoC with no AWS account; two variants of queue-driven processing; cost-limited experiment with missing quota; approved sandbox deployment path; failed experiment; safe cleanup plan; promotion without copying insecure fixtures. Ensure `aws-infrastructure` still owns CDK scaffolding and `aws-testing` owns full test suites.

### 5.5 `aws-well-architected` (NEW)

**Owner:** End-to-end workload assessment, structured evidence, risk prioritization and improvement plans across AWS Well-Architected's **six pillars** and the **Serverless Applications Lens**. **Not** a replacement for Architect design decisions or specialist Security/Cost/Observability audits.

**Extension types:** Read-only `well-architected-reviewer` agent + skills + structured scoring/evidence engine (SDK/MCP optional for pulling bounded evidence). Separate review guidance from any optional Well-Architected Tool API usage; do not invent official assessment status.

**Core capabilities:**

- Scope a workload and capture environment, stakeholders, architecture version, criticality, dependencies, constraints, data classification, evidence window and known unknowns.
- Review **Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization and Sustainability**, including serverless-specific failure, concurrency, idempotency, retries, monitoring and operational controls.
- Collect evidence from code/CDK, agreed AWS read-only APIs, design documents and explicitly supplied operational information. Track provenance and freshness for each finding.
- Separate **verified evidence**, **self-reported answers**, **automated inferences** and **missing evidence**. Never report unobserved practices as compliant.
- Explain severity, risk, blast radius and suggested action, with owner, priority, estimated effort and verification criteria. Don't invent universal pillar scores or official certification.
- Produce a review report, prioritized action backlog, improvement roadmap and re-review/change-delta view. Show which findings belong to specialist Security/Cost/Observability follow-ups.
- Support periodic/manual re-review without automatic ongoing monitoring or cloud changes.
- Optional integration with the AWS Well-Architected Tool only after confirming current SDK/API semantics and explicit consent to create/update an official workload record.

**Primary skills:** `review`, `assess`, `evidence`, `improve`, `compare`.

**Example files:** `docs/reviews/well-architected-review.md`, `evidence.json`, `improvement-plan.md`.

**Acceptance scenarios:** new design without deployed telemetry, deployed serverless workload with read-only evidence, partial permissions, ambiguous answers, six-pillar review including sustainability, resolved/unresolved risk comparison and missing-data reporting. Review report must not claim AWS certification.

## 6. Development — fourteen detailed plugin specifications

The fourteen plugins below remain unchanged in identity and scope from the previous Development specification. All development plugins are **NEW** under this instruction. Implementation must follow the domain boundaries in section 2 and route general diagram generation, PoCs and formal Well-Architected assessments to their new owners.

### 6.1 `aws-lambda` — functions and execution

**Owns:** Lambda handler development, function configuration and invocation workflows. It does not own API endpoints, messaging destinations, deployment pipelines or CloudWatch incident management.

**Core experiences**

- Inspect functions, runtimes, architectures, memory, timeout, environment key names (not secret values), versions, aliases, concurrency and event-source mappings.
- Scaffold or improve TypeScript handlers with validated input, clean business-logic separation, dependency injection when useful, structured logging and idempotency guidance.
- Generate representative event fixtures and safe local invocation harnesses; distinguish local execution from a real Lambda invoke.
- Invoke explicitly selected functions with a user-reviewed payload and safe limits; display request IDs, errors and execution summaries.
- Explain configuration tradeoffs: CPU/memory relationship, timeouts, ephemeral storage, cold starts, arm64/x86, VPC implications, provisioned/reserved concurrency and Lambda versions.

**Skills:** `inspect`, `create`, `invoke`, `review`, `optimize`.

**Implementations:** TypeScript SDK/CLI utilities; optional local MCP server for typed inspection/invoke tools. A specialist agent is not needed initially.

**Acceptance:** tests for timeout configuration, missing permissions, malformed payloads, aliases/versions, throttling and redaction. No invocation without identifying the function/account/region and confirming payload effects.

### 6.2 `aws-api` — client-facing APIs

**Owns:** API Gateway HTTP/REST/WebSocket APIs and AppSync GraphQL API contracts, resolver behavior, API routing and request/response protocols.

**Core experiences**

- Design/validate OpenAPI or GraphQL schema, request and response models, error conventions, pagination, quotas and versioning.
- Scaffold routes, integrations and typed client-facing contracts without duplicating the Lambda handler implementation.
- Inspect deployed API routes, stages, integrations, CORS, throttling and authorizer attachments.
- Test endpoints using explicit target environment, safe payloads and masked auth headers; provide WebSocket or GraphQL subscription testing where supported.
- Highlight differences between contract and deployed API; generate actionable compatibility findings.

**Skills:** `design`, `inspect`, `routes`, `test`, `review`.

**Implementations:** schema validators, SDK inspection tools and optional MCP. `aws-auth` owns Cognito/user sign-in; this plugin only integrates authorizers and scopes.

**Acceptance:** tests for broken schema references, unauthorized requests, CORS errors, conflicting routes, GraphQL validation and API stage confusion.

### 6.3 `aws-auth` — application identity

**Owns:** Amazon Cognito user pools/identity patterns, sign-in, federation, tokens, sessions and app authorization integration advice.

**Core experiences**

- Inspect user pools, app clients, domains, identity-provider configuration, security settings and sign-in requirements without retrieving credentials or user PII by default.
- Guide OAuth2/OIDC, hosted sign-in, PKCE, refresh-token rotation, MFA and session lifecycle design.
- Validate JWT verification examples, audience/issuer checks, token lifetime and role/group/scope authorization patterns.
- Build local test fixtures for claims and permissions; never print actual tokens.
- Identify unsafe client-secret usage, overly broad scopes, public clients with wrong flows and weak user-pool defaults.

**Skills:** `inspect`, `design`, `flows`, `review`.

**Implementations:** Skills + typed SDK inspection; optional specialized identity reviewer only for complex audits.

**Acceptance:** negative tests for invalid issuer/audience, token expiration, MFA enforcement, account recovery and unintended public access. User creation/deletion and password resets require explicit approval.

### 6.4 `aws-events` — routing and scheduling

**Owns:** Amazon EventBridge event buses, rules, targets, schemas and EventBridge Scheduler schedules.

**Core experiences**

- Inspect buses, rules, schedules, target configurations, event patterns and resource policies.
- Design event envelopes and versioning conventions; validate matching using test-event-pattern-style workflows when available.
- Explain delivery semantics, retries, failure destinations, permissions and cross-account routing.
- Inspect scheduled triggers, time zones, one-time versus recurring schedules, and target inputs.
- Produce structured bus/rule/target graph data that `aws-diagrams` may transform and `aws-ui` may display; do not implement a separate diagram exporter.

**Skills:** `routes`, `design`, `schedule`, `inspect`, `test`.

**Implementations:** SDK/CLI + optional MCP; no dedicated agent required. Do not duplicate diagram generation owned by `aws-diagrams`.

**Acceptance:** tests for unmatched patterns, target IAM failures, schedule timezone/DST, cross-account policy constraints and no unapproved event publishing.

### 6.5 `aws-messaging` — reliable messages

**Owns:** Amazon SQS queues and Amazon SNS topics, subscriptions, delivery and fan-out.

**Core experiences**

- Inspect queue/topic attributes, resource policies, SNS subscriptions, message filtering and DLQ/redrive configurations.
- Analyze standard vs FIFO semantics, visibility timeout, retention, throughput, ordering, deduplication and partial-batch failure patterns.
- Provide message payload fixtures and safe message publishing tests, with explicit opt-in for sending.
- Diagnose stuck messages, poison messages, retries, subscription confirmation and backlog behavior using available facts.
- Preview message bodies safely only after authorization, with truncation and sensitive-field redaction.

**Skills:** `inspect`, `design`, `diagnose`, `dlq`, `test`.

**Implementations:** SDK/MCP + skills; UI data for queue relationships if supported.

**Acceptance:** tests for FIFO group/dedup requirements, redrive policy, high backlog, malformed message, SNS filter policies and no implicit receive/delete side effects.

### 6.6 `aws-workflows` — orchestration

**Owns:** AWS Step Functions Standard and Express state machines, Amazon States Language, execution history and orchestration semantics.

**Core experiences**

- Generate or review state machines with Choice, Map, Parallel, Wait, Task, Retry, Catch and integration patterns.
- Validate ASL structure, supported query-language features such as JSONata where applicable, and state input/output handling.
- Inspect execution status and available execution history; account for differences in Standard and Express visibility.
- Analyze loops, excessive payloads, timeouts, retry storms, error-handling gaps and execution limits.
- Provide a structured state graph and selected execution trace; `aws-diagrams` owns diagram generation and `aws-ui` owns optional presentation.

**Skills:** `design`, `validate`, `inspect`, `debug`, `simulate`.

**Implementations:** ASL validators + SDK/MCP. Do not conflate a logical simulation with a real AWS execution.

**Acceptance:** tests for failed task, retry/backoff, catch paths, payload transformations, missing permissions, execution-status edge cases and cost-sensitive starts requiring approval.

### 6.7 `aws-database` — database access

**Owns:** DynamoDB and Aurora Serverless database design, queries, indexing, conditional writes and transaction patterns.

**Core experiences**

- Design DynamoDB primary keys, GSIs, access patterns, item collections and query shapes based on explicit workload requirements.
- Inspect tables, indexes, TTL, streams, PITR, encryption and capacity modes without reading actual customer rows by default.
- Inspect Aurora Serverless compatibility, connection patterns, transaction considerations and the supported Data API where relevant.
- Provide bounded, read-only query inspection; explain scans, read capacity, hot keys, pagination, query plans and indexes.
- Review migration strategies and schema changes as plans rather than running data writes automatically.

**Skills:** `model`, `inspect`, `query`, `review`, `migrate-plan`.

**Implementations:** service SDKs, optional typed query MCP and schema/model review skills.

**Acceptance:** tests for pagination, full-table scans, sensitive data redaction, conditional writes, incompatible Aurora options, empty/missing index and cross-region/account ambiguity. No production mutation by default.

### 6.8 `aws-storage` — objects and files

**Owns:** S3 objects/buckets and EFS file systems as application storage primitives.

**Core experiences**

- Inspect buckets, prefixes, object metadata, versioning, lifecycle, encryption, public-access settings and EFS access points and mount targets.
- Design uploads/downloads using presigned URLs, multipart upload, checksum verification and content type validation.
- Evaluate S3 event notifications, eventual downstream consumers, storage-class lifecycle and data-retention implications.
- Explain EFS/Lambda VPC/mount-access patterns, throughput and cost tradeoffs.
- Generate safe examples for user-generated file handling, object key naming and access boundaries.

**Skills:** `inspect`, `upload-design`, `review`, `lifecycle`, `access`.

**Implementations:** SDK/MCP and optional safe transfer tools.

**Acceptance:** tests for region redirects, missing object, access denied, path/key traversal, accidental public access, large objects, versioning and no deletion or mass copy without a reviewed plan.

### 6.9 `aws-streaming` — continuous data streams

**Owns:** Kinesis Data Streams and Amazon Data Firehose ingestion, stream consumers, batching and managed delivery.

**Core experiences**

- Inspect shard/stream state, retention, consumers, throughput modes, delivery streams, buffers and destinations.
- Explain records/partition keys, ordering boundaries, retries, backpressure, checkpointing and consumer failure modes.
- Provide controlled producer/consumer test fixtures and transformations; never start an unbounded load test.
- Diagnose lag, throttling, delivery failures and malformed records using service metrics and available events.
- Validate sink configurations to S3 and other supported destinations, without taking ownership of their storage/database lifecycle.

**Skills:** `inspect`, `design`, `diagnose`, `test`.

**Implementations:** SDK/MCP + service-specific validators; hand metrics correlation to `aws-observability`.

**Acceptance:** tests for throttling, sequence ordering assumptions, oversized record, backpressure, delivery errors and controlled operation budgets.

### 6.10 `aws-edge` — content delivery

**Owns:** CloudFront distributions, CloudFront Functions, Lambda@Edge and cache behaviors.

**Core experiences**

- Inspect origins, behaviors, viewer/origin policies, headers, signed URLs/cookies, invalidation rules and domain/TLS association.
- Scaffold and test small CloudFront Functions with the service's runtime and restrictions in mind.
- Review Lambda@Edge deployment constraints and region/version requirements before proposing changes.
- Diagnose caching, routing, 403/404, redirects, security headers and stale-object behavior.
- Explain invalidation costs and propagation limitations, and avoid gratuitous cache invalidations.

**Skills:** `inspect`, `cache`, `function`, `review`, `diagnose`.

**Implementations:** CLI/SDK helpers + skills; `aws-infrastructure` owns distribution CDK definition and `aws-deploy` owns rollout.

**Acceptance:** tests for wrong cache policy, origin request forwarding, CloudFront Function restrictions, Lambda@Edge regional constraints, DNS/TLS mismatch and invalidation approval.

### 6.11 `aws-ai` — AI applications and agents

**Owns:** Amazon Bedrock model usage, RAG with Knowledge Bases, and Bedrock AgentCore application/agent integrations.

**Core experiences**

- Guide model selection with explicit availability, quotas, latency, data-handling and cost considerations; never assume a model is enabled in a region.
- Scaffold inference calls, request validation, streaming responses and resilient retries with configurable budgets.
- Design retrieval workflows with chunking, embeddings, indexing, grounding and evaluation datasets.
- Support AgentCore concepts such as Runtime, Gateway and Identity through validated examples and available APIs, without inventing service contracts.
- Create evaluation harnesses for quality, safety, regression, latency and token use; store no prompts containing secrets by default.

**Skills:** `build`, `rag`, `agent`, `evaluate`, `inspect`.

**Implementations:** One optional `bedrock-engineer` subagent + SDK/MCP. For service-specific integration, prefer official supported tooling.

**Acceptance:** tests for unavailable model/region, throttling, token/cost budget, ungrounded retrieval, permission denial, PII handling, timeouts and safe agent tool permissions. Any live inference requires explicit awareness of potential charges.

### 6.12 `aws-containers` — serverless containers

**Owns:** ECS workloads using Fargate and ECR image lifecycle; not self-managed servers or a generalized Kubernetes platform.

**Core experiences**

- Inspect ECS clusters, services, tasks, task definitions, networking, capacity configuration and ECR images.
- Scaffold container-ready service code, Dockerfiles, health checks and appropriate local builds.
- Validate image architecture, tag/digest usage, health checks, secrets injection, resource limits and task execution roles.
- Diagnose task placement/start failures, crash loops, image pulls and load-balancer health using available service details.
- Propose deployment-safe task definition changes; `aws-deploy` owns deployment execution.

**Skills:** `inspect`, `containerize`, `review`, `diagnose`, `image`.

**Implementations:** Docker/ECR/ECS CLI/SDK, optional MCP; no agent required initially.

**Acceptance:** tests for ECR auth failure, missing image, architecture mismatch, VPC endpoint/connectivity problems, incorrect task IAM role, unhealthy service and approval for image push.

### 6.13 `aws-email` — application email

**Owns:** Amazon SES sending/receiving, email identities, domain verification, sender reputation, templates and email-delivery events.

**Core experiences**

- Inspect verified domains/addresses, sender identities, DKIM, SPF/DMARC guidance, configuration sets and the SES sandbox/sending quotas.
- Scaffold transactional messages and templates, validation, unsubscribe requirements where applicable, and safe sending integrations.
- Develop receiving flows using supported SES receipt rules/actions, S3 and Lambda, without duplicating their lower-level service tools.
- Diagnose bounces, complaints, suppression and delivery events; integrate SNS/EventBridge as transports while SES owns email semantics.
- Offer a safe dry-run that validates a template and recipient format **without sending email**.

**Skills:** `check`, `template`, `send-test`, `receive`, `deliverability`.

**Implementations:** SES SDK/MCP + template tools. Mail sending and receiving changes need explicit consent, with recipient preview and volume limits.

**Acceptance:** tests for unverified identity, sandbox recipient restrictions, invalid templates, high bounce rates, missing domain authentication, sensitive email/PII exposure and no silent outbound send.

### 6.14 `aws-config` — dynamic runtime configuration

**Owns:** AWS AppConfig (including feature flags) and Systems Manager Parameter Store for non-secret application runtime configuration.

**Core experiences**

- Inspect AppConfig applications, environments, configuration profiles, validators, deployment strategies and current deployment status.
- Model typed application settings and feature flags with local schemas, defaults and environment overrides.
- Explain safe rollout and rollback strategies and supported validators/alarms.
- Inspect Parameter Store names, tiers, types and references while masking sensitive values.
- Scaffold Lambda/other compute integration using supported AppConfig agents/extensions or SDK-based retrieval patterns, with caching and graceful fallback.

**Skills:** `inspect`, `flags`, `validate`, `rollout-plan`, `parameters`.

**Implementations:** SDK tools + skills; optional validation hook for config files. `aws-deploy` manages generalized release pipeline and `aws-security` manages Secrets Manager/secret policy.

**Acceptance:** tests for malformed JSON/schema, missing parameter, environment mismatch, invalid flag rule, rollout alarms, stale cache and no deployment/change of live flag without approval.

## 7. Implementation structure and file layout

The plugin marketplace is one repository. Do **not** introduce `core/agents/workflows/integrations` category directories inside `plugins/`. Keep one independent plugin folder per distributable capability.

```text
claude-code-for-aws/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   ├── aws-context/           # existing
│   ├── aws-ui/                # existing
│   ├── aws-guard/             # existing
│   ├── aws-explorer/          # existing
│   ├── aws-architect/         # existing: migrate ownership
│   ├── aws-infrastructure/    # existing: migrate ownership
│   ├── aws-security/          # existing
│   ├── aws-testing/           # existing
│   ├── aws-deploy/            # existing
│   ├── aws-cost/              # existing
│   ├── aws-observability/     # existing
│   ├── aws-diagrams/          # NEW DESIGN
│   ├── aws-prototyping/       # NEW DESIGN
│   ├── aws-well-architected/  # NEW DESIGN
│   ├── aws-lambda/            # NEW DEVELOPMENT
│   ├── aws-api/
│   ├── aws-auth/
│   ├── aws-events/
│   ├── aws-messaging/
│   ├── aws-workflows/
│   ├── aws-database/
│   ├── aws-storage/
│   ├── aws-streaming/
│   ├── aws-edge/
│   ├── aws-ai/
│   ├── aws-containers/
│   ├── aws-email/
│   └── aws-config/
├── packages/                   # only truly shared, bundled runtime/schema code
├── tests/                      # cross-plugin integration, safety, evals
├── docs/
│   └── plugin-ownership-migration.md
├── AGENTS.md
├── README.md
└── package.json
```

Example of one **new** plugin; component folders are optional, not mandatory:

```text
plugins/design/aws-diagrams/
├── .claude-plugin/plugin.json
├── skills/
│   ├── generate/SKILL.md
│   └── from-cdk/SKILL.md
├── scripts/                 # compiled and bundled TS code
├── tests/
├── .mcp.json                # ONLY when a real typed server exists
└── README.md
```

**Packaging requirements:** A plugin is copied into an isolated cache at install time; bundle all executable code and required runtime libraries. Never reference arbitrary parent paths or unpublished source dependencies. Validate relative paths, plugin startup, plugin-local bin execution and MCP startup from the packaged directory.

**Public integration requirement:** If `aws-diagrams` needs architecture data, prefer a documented schema/CLI/skill handoff rather than reaching into another plugin's private folders. If no inter-plugin data interface is available, accept a user-selected file path or structured input as a portable fallback.

## 8. Integration scenarios — required end to end

| User goal                               | Owning plugins and handoff                                                    | Must demonstrate                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Design authenticated REST API           | Architect -> Diagrams -> Infrastructure -> API/Auth/Lambda/Database           | ADR + editable diagram + CDK proposal + safe test plan                    |
| Prototype async order processing        | Prototyping -> Events/Messaging/Lambda/Database -> Testing -> optional Deploy | Experiment hypothesis, bounded fixtures, evidence, promotion plan         |
| Assess existing serverless project      | Well-Architected + Architect + Security/Cost/Observability                    | Six pillars, verified vs missing evidence, improvement backlog            |
| Visualize CDK stacks                    | Infrastructure -> Diagrams -> optional UI                                     | Declared resources vs deployed inventory labeled correctly                |
| Diagram a live event flow               | Explorer/Events/Messaging/Workflows -> Diagrams -> optional UI                | Provenance, partial evidence, redaction and text fallback                 |
| Improve AWS workload                    | Well-Architected -> Architect/Infrastructure/Development                      | Prioritized recommendations; no cloud mutation without approval           |
| Compare two PoC alternatives            | Prototyping + Testing/Cost -> Architect                                       | Same input, budgets, results and documented tradeoffs                     |
| Deploy a validated prototype to sandbox | Prototyping -> Guard/Context -> Deploy                                        | Specific account/region, cost awareness, user approval, cleanup plan      |
| SES-based notification flow             | Email + Events/Messaging + Lambda/Storage                                     | No actual email send without recipient approval                           |
| Design AI/RAG prototype                 | Architect + AI + Prototyping + Data/Storage                                   | Model availability checked, token/cost limits, evidence-based eval        |
| CloudFront web app                      | Edge + Storage + API/Auth + Diagrams                                          | Separation of CDN and origin responsibilities, no unapproved invalidation |
| Debug failed workflow                   | Workflows + Observability + Diagrams                                          | Execution history vs inferred flow, no invented trace                     |

Plugins do not need to magically install one another. A missing optional plugin results in a useful local/text output plus accurate guidance on additional capabilities.

## 9. Security, correctness and operational constraints

1. **AWS identity and scope:** Verify account with STS when needed; show region and resource targets before sensitive actions. Honor existing `aws-context` behavior, do not replace it.
2. **Read-only default:** No AWS writes, publishes, Lambda invocations with unknown side effects, data copies, expensive inference, load tests, deploys, deletes, redrives, email sends or official Well-Architected workload record writes without explicit approval.
3. **Production controls:** Follow `aws-guard` where installed and AWS IAM/SCP/resource policy enforcement at all times. Never imply a hook is an authoritative security barrier.
4. **Sensitive data:** Redact or omit secret values, tokens, credentials, customer payloads, logs with PII and SES message bodies unless explicitly scoped and authorized.
5. **Budgets and bounds:** Limit result size, AWS API pagination, time windows, concurrency, total cloud expenses, retries and timeouts. Warn when a command can create billable resources.
6. **Grounding:** Distinguish declared infrastructure from deployed reality, verified telemetry from inferred graphs, local simulations from real tests and estimated costs from billed costs.
7. **AWS constraints:** Detect availability of services/features by region, quota/account status, API compatibility and current SDK specifics. Do not hallucinate nonexistent APIs, capabilities or JSON fields.
8. **Failure handling:** Handle throttling, partial permissions, no credentials, no UI support, missing optional plugins, stale caches, malformed schemas, invalid CDK and cross-account confusion.
9. **Test environment:** Never use real production accounts for tests without an explicit, reviewed, user-approved dedicated plan. Prefer mocks and fixtures.
10. **Plugin limits:** Confirm actually supported Claude Code components/manifest syntax in the installed version; use built-in extension APIs, not private UI hacks.
11. **No hidden setup:** No telemetry, always-on daemons, forced global configuration edits or secret store created by default.
12. **No empty plugins:** A plugin must perform verifiable tasks and provide complete documentation, not only generic natural-language advice.

## 10. Tests and acceptance criteria

### Each of 17 NEW plugins must pass

- Plugin manifest and marketplace validation (`claude plugin validate <path>` and marketplace validation as appropriate).
- Unit tests for typed schemas, parsing, transformations, helpers and deterministic business logic.
- Negative fixture tests covering failure conditions: AccessDenied, throttling, expired credentials, timeouts, pagination, missing resources and incorrect region.
- Realistic **end-to-end local** workflow without any AWS credentials when the functionality supports local operation.
- Read-only AWS integration tests in an optional sandbox when explicitly enabled; separate dry-run and mutation test credentials.
- Agent/skill behavior evals that show tool selection, safety, meaningful outputs and correct boundary delegation.
- Standalone installation with **only that plugin** and no implicit repository/other-plugin imports.
- Plain text output without `aws-ui`, plus optional structured output with correct provenance for available renderers.
- Documentation listing purpose, commands, permissions, expected AWS charges, installation, 3 examples, errors and exact limitations.
- Test evidence and status recorded in an implementation matrix.

### Special quality checks for new Design plugins

**Diagrams:** stable IDs and layout where possible; proper Mermaid syntax; graph integrity; multiple diagram types; provenance; no sensitive labels; source/editable export always available.

**Prototyping:** bounded hypothesis and success metric; no AWS costs by default; mocked vs real evidence clearly separated; safe sandbox handoff; cleanup plan; promotion document; no duplicate deploy engine.

**Well-Architected:** all six pillars; Serverless Applications Lens; provenance and unknown evidence; no invented AWS official certification or risk score; specialist findings reused without performing invasive audits; improvement plan tied to evidence.

### Migration acceptance tests

- Existing `aws-architect` still designs and compares architectures without installing the three new plugins.
- Existing `aws-infrastructure` still scaffolds/CDK-synths/CDK-diffs without the three new plugins.
- New `aws-diagrams` works by itself on a supplied graph/document, and uses `aws-ui` only for optional presentation.
- Existing diagram functionality/commands have a documented safe migration, not an unexplained disappearance.
- Existing Well-Architected or prototype features, where present, have a new owner and no silent duplicate implementation.
- All eleven existing plugins still pass prior tests after new plugins are added.
- No public manifest entry is lost and no user data is overwritten.

**Definition of done:** working code and outputs, passing tests, clear supported/unsupported scenarios, source-of-truth ownership, safe operation, and a verified installation from the marketplace. No TODO-only features described as complete.

## 11. Implementation sequence for Claude Code

### Phase 0 — Audit the existing repository (mandatory)

- Inventory every existing plugin, command, skill, agent, MCP, hook, mod, shared package and runtime contract.
- Check especially `aws-architect`, `aws-infrastructure`, `aws-ui`, `aws-security`, `aws-cost`, `aws-observability`, `aws-testing`, and `aws-deploy` for diagram/prototype/Well-Architected functionality.
- Produce `docs/plugin-ownership-migration.md` before editing affected code; list precise files, move targets, dependency risks, compatibility strategy and tests.
- Verify active Claude Code plugin spec and installed version; check AWS APIs and service feature availability relevant to new tools.

### Phase 1 — Establish Design ownership and release the new Design plugins

1. Implement `aws-diagrams` with portable Mermaid/graph support, tests and optional UI handoff.
2. Extract diagram-related behavior from Architect/Infrastructure/UI as appropriate, without removing graph data extraction or UI rendering responsibilities.
3. Implement `aws-well-architected` with six-pillar review, scoped evidence and improvement backlogs; migrate formal review workflows from Architect, not specialist Security/Cost/Observability tools.
4. Implement `aws-prototyping` with local-first experiments, bounded templates and handoff to CDK/Testing/Deploy; migrate any general PoC orchestration that currently lives elsewhere.
5. Update Architect/Infrastructure commands, docs, tests and compatibility contracts. Verify each independently and in combination.

### Phase 2 — Build core Development plugins

6. `aws-lambda`
7. `aws-api`
8. `aws-auth`
9. `aws-events`
10. `aws-messaging`
11. `aws-workflows`
12. `aws-database`
13. `aws-storage`

### Phase 3 — Complete the specialized Development plugins

14. `aws-streaming`
15. `aws-edge`
16. `aws-email`
17. `aws-config`
18. `aws-containers`
19. `aws-ai`

### Phase 4 — Integration, QA and publishing

- Register each new plugin in the marketplace only when installed code validates; preserve existing entries.
- Run independent install/startup, optional dependency, negative path, agent eval, safety, cross-plugin and full regression tests.
- Verify the UI can render diagram and review results through supported interfaces, and text fallback always works.
- Update public README/catalog and release notes; link plugin documentation and migration instructions.
- Produce an **implementation matrix** with status: `not-started | implemented | tested | unverified | blocked`, test commands and evidence.
- Never announce the suite as fully production-ready if any promised behavior is unverified or merely a mock.

## 12. Expected deliverables

1. **Seventeen new installable plugins** with real implementation, public manifests, skills/agents/tools as appropriate, tests and README.
2. Refactored existing **`aws-architect` and `aws-infrastructure`** with clear bounded responsibilities and compatibility tests.
3. Minimal safe ownership changes to additional existing plugins only where code actually duplicates one of the new Design responsibilities.
4. Updated `.claude-plugin/marketplace.json` with **28 catalog entries** when the reported 11 existing entries are confirmed (do not fabricate entries or overwrite real catalog state).
5. `docs/plugin-ownership-migration.md`, upgrade notes, architecture schemas and user-facing examples.
6. Validation evidence, full test suite results, scenario demonstration results and unverified limitations.
7. No new standalone backend or required customer AWS deployment solely to run plugins.

## 13. Official documentation and verification references

**Claude Code:**

- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins/components
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/plugins/mods

**AWS architecture and patterns:**

- https://docs.aws.amazon.com/wellarchitected/latest/framework/
- https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/the-pillars-of-the-well-architected-framework.html
- https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/general-design-principles.html
- https://docs.aws.amazon.com/solutions/latest/constructs/welcome.html
- https://docs.aws.amazon.com/cdk/v2/guide/home.html

**Development services:**

- https://docs.aws.amazon.com/lambda/latest/dg/welcome.html
- https://docs.aws.amazon.com/ses/latest/dg/Welcome.html
- https://docs.aws.amazon.com/appconfig/latest/userguide/what-is-appconfig.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/

All implementation details and service region/version support must be validated at build time against live official references, not assumed from this specification.

## 14. Execution instruction to Claude Code

> Read this file and the repository instructions. Inventory the existing plugins and their real capabilities before implementation. Treat Design and Development as the only product categories in this task. Create the three new Design plugins and fourteen new Development plugins as independently installable, tested packages. Refactor `aws-architect` and `aws-infrastructure` to remove duplicate ownership of diagrams, prototyping and formal Well-Architected assessment, preserving compatibility wherever feasible. Move only existing functionality proven to be present, do not delete it before tests pass, and do not modify unrelated plugins beyond justified integrations. Implement in validated increments with clear evidence, never claim broad completion from manifests or prompts alone. Follow read-only defaults and explicit consent for all AWS mutations. Generate the ownership migration report, completed code, tests, documentation, final marketplace and an accurate implementation status report.

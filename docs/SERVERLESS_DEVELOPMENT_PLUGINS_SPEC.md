# Serverless Development Plugins — Implementation Specification

**Status:** Implementation specification  
**Scope:** 14 independent Claude Code plugins for AWS serverless application development  
**Primary stack:** AWS CDK v2, TypeScript, Node.js, AWS SDK for JavaScript v3  
**Date:** 2026-10-30

## 1. Mission

Extend an existing Claude Code plugin marketplace with a complete, practical set of **AWS serverless development tools**. The experience should make it easy to build and operate real applications without turning the marketplace into a collection of generic prompts or a duplicate of the AWS Console.

Implement the 14 plugins specified below. Each plugin owns one cohesive technical domain, is independently installable, and provides an intuitive set of skills or commands. Use agents, MCP servers, CLI tools, hooks, and UI integrations only when each brings measurable value. **A plugin must provide working functionality, not just a manifest and a README.**

These are development plugins. They complement, rather than replace, the marketplace's existing architecture, infrastructure, security, testing, deployment, cost, and observability plugins.

### Existing plugins — preserve and integrate

- `aws-context` — account/profile/region/SSO identity and AWS context.
- `aws-ui` — terminal UI, status, and supported visualizations.
- `aws-guard` — defensive operation policies and approval controls.
- `aws-explorer` — general resource discovery and inspection.
- `aws-architect` — architecture decisions and Well-Architected analysis.
- `aws-infrastructure` — AWS CDK TypeScript, stacks, constructs, synth/diff and infrastructure lifecycle.
- `aws-security` — security analysis, IAM, encryption, compliance and secrets policy.
- `aws-testing` — general testing and test orchestration.
- `aws-deploy` — cloud deployment and delivery workflows.
- `aws-cost` — cost analytics and optimization.
- `aws-observability` — logs, traces, metrics, incidents and alerts.

**Before writing code:** inspect the repository, existing plugin APIs, build scripts, workspace layout, installed Claude Code version, tool conventions, and public interfaces. Treat the list above as a product inventory, not proof that particular interfaces have already been implemented. Reuse working interfaces; do not guess or silently alter existing plugins.

## 2. The 14 plugins

| Plugin | AWS services | Exclusive responsibility | Primary extension types |
|---|---|---|---|
| `aws-lambda` | Lambda | Function code, invocation, runtime behavior and function lifecycle | Skills, SDK/CLI, optional MCP |
| `aws-api` | API Gateway, AppSync | HTTP/REST/GraphQL/WebSocket APIs and API contracts | Skills, contract tooling, optional MCP |
| `aws-auth` | Cognito | User authentication, identity flows, tokens and application authorization patterns | Skills, optional agent, SDK tooling |
| `aws-events` | EventBridge, EventBridge Scheduler | Event buses, routing rules, schemas and scheduled triggers | Skills, SDK/MCP, optional diagrams |
| `aws-messaging` | SQS, SNS | Queues, topics, subscriptions and reliable message delivery | Skills, SDK/MCP |
| `aws-workflows` | Step Functions | Stateful orchestration, state machines and executions | Skills, ASL validation, SDK/MCP |
| `aws-database` | DynamoDB, Aurora Serverless | Database modeling, access patterns, query inspection and data operations | Skills, SDK/MCP |
| `aws-storage` | S3, EFS | Object/file storage, transfer and access patterns | Skills, SDK/MCP |
| `aws-streaming` | Kinesis Data Streams, Amazon Data Firehose | Stream ingestion, consumers, delivery and record-processing patterns | Skills, SDK/MCP |
| `aws-edge` | CloudFront, CloudFront Functions, Lambda@Edge | CDN behavior, caching, edge execution and content delivery | Skills, test utilities, SDK |
| `aws-ai` | Bedrock, Bedrock AgentCore | Generative AI applications, RAG and deployed agent integrations | Specialized agent, skills, SDK/MCP |
| `aws-containers` | ECS, Fargate, ECR | Serverless container workloads and image lifecycle | Skills, CLI/SDK, optional MCP |
| `aws-email` | Amazon SES | Sending, receiving and deliverability of application email | Skills, SDK/MCP |
| `aws-config` | AWS AppConfig, SSM Parameter Store | Runtime configuration, feature flags and environment parameters | Skills, SDK/MCP, optional hooks |

**Service naming:** Use the current name **Amazon Data Firehose** (formerly Kinesis Data Firehose), while retaining compatibility with AWS SDK/CLI identifiers such as `firehose`.

## 3. Responsibility boundaries — mandatory

A development plugin must **own its service's application behavior**, not absorb a neighboring plugin's responsibility.

| Concern | Owner | Boundary for the 14 new plugins |
|---|---|---|
| Solution design and service selection | `aws-architect` | New plugins may explain service-specific tradeoffs, but not replace architecture reviews. |
| CDK stacks, constructs, synth, diff, drift | `aws-infrastructure` | New plugins may generate examples/construct proposals; hand off IaC lifecycle to Infrastructure. |
| Credentials, selected account/region | `aws-context` | Consume verified context if available; never invent account identity. |
| Visual panels and graph presentation | `aws-ui` | Publish structured results; do not embed competing UI implementations. |
| General resource inventory | `aws-explorer` | Offer deeper, domain-specific inspection only. |
| Security audit and IAM governance | `aws-security` | Enforce safe service behavior locally and request specialist review when relevant. |
| Blocking risky operations | `aws-guard` plus AWS IAM/SCP | Respect operation policies; hooks alone are not a security boundary. |
| Full test suite and test orchestration | `aws-testing` | Provide service-specific fixtures, validators and tests; integrate with existing runner. |
| Deployment, pipeline, rollback | `aws-deploy` | New plugins must not invent their own general deployment manager. |
| Cost reports and budgets | `aws-cost` | Surface service cost implications and send detailed analysis to Cost. |
| General diagnostics, alarms and traces | `aws-observability` | Own only service-native insights; correlate through Observability. |
| API contract/routes | `aws-api` | `aws-auth` owns identity flows; `aws-lambda` owns handler behavior. |
| Identity, sign-in and user pools | `aws-auth` | `aws-api` attaches authorizers but does not duplicate identity management. |
| Event routing | `aws-events` | `aws-messaging` handles queue/topic semantics; `aws-workflows` owns orchestration. |
| Durable queues and fan-out delivery | `aws-messaging` | Do not rebuild bus rules or state machines. |
| State-machine orchestration | `aws-workflows` | Do not move Step Functions into `aws-events`. |
| Database records/indexes | `aws-database` | S3/EFS file/object workflows belong to `aws-storage`. |
| Secrets | `aws-security` | `aws-config` references secret identifiers but never logs their contents. |
| Transactional email | `aws-email` | `aws-messaging` owns SNS transports; email plugin owns SES identities, templates and delivery. |

Cross-plugin collaboration must be **optional, explicit, documented, and versioned**. Do not rely on another plugin's private files, require users to install every plugin, or assume automatic shared in-memory state.

## 4. Developer experience and common command contract

Every plugin should feel useful immediately after installation:

1. A concise, task-focused README: purpose, prerequisites, three realistic examples, permissions, cost caveats, and troubleshooting.
2. A maximum of **3–6 primary user-facing skills**. Avoid separate commands for every AWS API operation.
3. Sensible defaults: read-only first, detected project configuration, AWS context from installed `aws-context` when available, and explicit account/region in outputs.
4. Guided errors rather than AWS exception dumps; report missing permissions, unavailable regions, sandbox restrictions, and expired credentials distinctly.
5. A dry-run/plan mode for changes when available. The user must approve cloud writes, external messaging, data modification and cost-incurring operations.
6. Text-mode behavior that works without `aws-ui`; structured data for optional visualization where a supported interface exists.
7. No hidden credential storage, telemetry, hosted backend or always-on daemon by default.

### Example consistent usage

```text
/aws-lambda:inspect
/aws-api:design
/aws-auth:review
/aws-events:routes
/aws-messaging:diagnose
/aws-workflows:inspect
/aws-database:model
/aws-storage:inspect
/aws-streaming:inspect
/aws-edge:audit
/aws-ai:build
/aws-containers:inspect
/aws-email:check
/aws-config:inspect
```

Do not make the basic workflow require users to remember an MCP tool name. Skills should orchestrate the tools behind simple commands.

### Reusable output envelope (proposed internal contract)

```ts
type AwsOperationResult<T> = {
  schemaVersion: 1;
  plugin: string;
  operation: string;
  accountId?: string;
  region?: string;
  resourceArns?: string[];
  observedAt: string;
  source: "aws-api" | "local-code" | "fixture" | "estimate";
  status: "success" | "partial" | "blocked" | "failed";
  data?: T;
  findings?: Array<{
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    explanation: string;
    evidence?: string[];
    recommendedAction?: string;
  }>;
  warnings?: string[];
};
```

This is a design proposal, not an existing Claude Code API. Adopt or adapt to the actual repository contracts after inspection. Do not report estimated or fixture data as real AWS observations. Mask sensitive fields before sending results to the model or UI.

## 5. Plugin-by-plugin product specifications

### 5.1 `aws-lambda` — functions and execution

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

### 5.2 `aws-api` — client-facing APIs

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

### 5.3 `aws-auth` — application identity

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

### 5.4 `aws-events` — routing and scheduling

**Owns:** Amazon EventBridge event buses, rules, targets, schemas and EventBridge Scheduler schedules.

**Core experiences**
- Inspect buses, rules, schedules, target configurations, event patterns and resource policies.
- Design event envelopes and versioning conventions; validate matching using test-event-pattern-style workflows when available.
- Explain delivery semantics, retries, failure destinations, permissions and cross-account routing.
- Inspect scheduled triggers, time zones, one-time versus recurring schedules, and target inputs.
- Produce a structured bus/rule/target graph for optional visualization through `aws-ui`.

**Skills:** `routes`, `design`, `schedule`, `inspect`, `test`.

**Implementations:** SDK/CLI + optional MCP; no dedicated agent required.

**Acceptance:** tests for unmatched patterns, target IAM failures, schedule timezone/DST, cross-account policy constraints and no unapproved event publishing.

### 5.5 `aws-messaging` — reliable messages

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

### 5.6 `aws-workflows` — orchestration

**Owns:** AWS Step Functions Standard and Express state machines, Amazon States Language, execution history and orchestration semantics.

**Core experiences**
- Generate or review state machines with Choice, Map, Parallel, Wait, Task, Retry, Catch and integration patterns.
- Validate ASL structure, supported query-language features such as JSONata where applicable, and state input/output handling.
- Inspect execution status and available execution history; account for differences in Standard and Express visibility.
- Analyze loops, excessive payloads, timeouts, retry storms, error-handling gaps and execution limits.
- Provide a state graph and selected execution trace to `aws-ui`, when available.

**Skills:** `design`, `validate`, `inspect`, `debug`, `simulate`.

**Implementations:** ASL validators + SDK/MCP. Do not conflate a logical simulation with a real AWS execution.

**Acceptance:** tests for failed task, retry/backoff, catch paths, payload transformations, missing permissions, execution-status edge cases and cost-sensitive starts requiring approval.

### 5.7 `aws-database` — database access

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

### 5.8 `aws-storage` — objects and files

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

### 5.9 `aws-streaming` — continuous data streams

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

### 5.10 `aws-edge` — content delivery

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

### 5.11 `aws-ai` — AI applications and agents

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

### 5.12 `aws-containers` — serverless containers

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

### 5.13 `aws-email` — application email

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

### 5.14 `aws-config` — dynamic runtime configuration

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

## 6. Plugin implementation layout

Use the official Claude Code plugin format for each independently installable plugin. A full plugin **may** contain all types below, but only ship components that are needed.

```text
plugins/aws-example/
├── .claude-plugin/
│   └── plugin.json
├── agents/                 # Only when a specialist subagent adds value
├── skills/
│   ├── inspect/
│   │   └── SKILL.md
│   └── review/
│       └── SKILL.md
├── hooks/                  # Only deterministic lifecycle behaviors
│   └── hooks.json
├── .mcp.json               # Only if a real tool server is needed
├── scripts/                # CLI/SDK-backed implementation, built for distribution
├── tests/                  # Unit, fixtures, integration and behavior tests
└── README.md
```

The plugin marketplace remains a single repository:

```text
claude-code-for-aws/
├── .claude-plugin/marketplace.json
├── plugins/
│   ├── aws-context/           # Existing — preserve
│   ├── aws-ui/                # Existing — preserve
│   ├── ...                    # Other existing plugins — preserve
│   ├── aws-lambda/
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
├── packages/                  # Optional: truly shared runtime/schema packages
├── tests/
├── docs/
└── package.json
```

**Packaging rule:** Claude Code installs plugin directories independently. Bundle the actual scripts and dependencies needed for each plugin. Never rely on `../../packages/*` being present in the installed plugin's cache. Build or bundle needed code into the plugin's distributable directory, and validate the installed artifact.

## 7. Tooling strategy

- Prefer existing AWS SDK v3 clients, the AWS CLI, and official MCP servers for basic AWS API operations.
- Use a **plugin-local TypeScript tool or MCP server** only when it creates higher-level value: structured inspection, safe bounded queries, schema validation, fixture generation, tracing or batch analysis.
- Do not stand up fourteen long-lived MCP servers simply because there are fourteen plugins. Where local CLI commands solve the problem, prefer CLI commands.
- The marketplace may reuse an official AWS MCP integration, but do not make every plugin dependent on its installation. Offer working fallback paths through permitted SDK/CLI tools when practical.
- Reuse existing `aws-ui` interfaces for optional graphs and panels; do not assume arbitrary mod APIs or cross-plugin state sharing are available. Verify the target Claude Code version.
- Use hooks for deterministic validation and safety, not to launch expensive AWS polling on every tool invocation.
- For write operations, return a structured change plan with target account/region, affected resources, permissions, anticipated impact and rollback limitations. Request approval before execution; comply with `aws-guard` and actual IAM.

## 8. Security, correctness, and best practices

Applies to **all fourteen**:

1. **Read-only by default.** Never send live email, post events, publish to SNS, write database rows, upload objects, invoke effectful functions, start executions or incur nontrivial cloud costs without a user-approved operation.
2. **Verified identity.** Use AWS credential-provider chain and `aws-context` where possible; verify account via STS before sensitive operations; show the exact target region/account.
3. **No secrets in logs.** Redact Authorization headers, API keys, tokens, private data, mail contents, database data and environment variable values. Respect access controls and minimize model exposure to sensitive payloads.
4. **Production caution.** Require an explicit user-approved plan for mutations in production. IAM/SCP/resource policies are the real enforcement boundary; Claude hooks alone are not a substitute.
5. **Bounded operations.** Limit query results, object sizes, time ranges, pagination, stream reads, retries, load tests and cost-sensitive calls.
6. **Accurate results.** Distinguish facts observed through AWS APIs, inferred code configuration, local simulation, fixtures and estimates.
7. **Service constraints.** Verify region/feature availability, quota differences, eventual consistency, cross-account roles and stage/environment semantics.
8. **Resilience.** Apply idempotency, appropriate retries/backoff and visibility into partial failures. Do not hide API errors or silently retry unsafe writes.
9. **Infrastructure ownership.** Route CDK changes through the existing Infrastructure workflow and cloud execution through Deploy. Plugins may suggest or generate implementation code, not bypass these boundaries.
10. **No accidental data exposure.** Do not read sensitive content just to produce an overview. Fetch resource metadata first and allow explicit scoped data access.
11. **No fictional integration.** Do not invent APIs, tools, hooks or status fields. Confirm actual API behavior in the current Claude Code and AWS SDK documentation.
12. **No placeholder releases.** Do not label features complete if they only emit instructions or mocks when real tools are promised.

## 9. Test and verification requirements

Every plugin must ship:

- **Manifest checks:** `claude plugin validate` for both plugin and marketplace.
- **Unit tests:** all parsing, validation, permission guards, configuration schemas, data transforms and output serializers.
- **Fixture tests:** representative AWS responses, failures, pagination, timeouts, rate limits and access-denied errors.
- **Integration tests:** mocked or isolated SDK/CLI integrations without requiring production credentials; optional live AWS tests using dedicated sandbox resources and user consent.
- **Behavior/evaluation tests:** demonstrate that skills invoke the correct bounded tools, select the correct account/region, avoid dangerous actions and produce grounded results.
- **Independent install tests:** install only the target plugin from the marketplace; verify no unbundled monorepo paths, cross-plugin assumptions or hidden global configuration dependencies.
- **Usability tests:** a clean user can run one documented command and obtain a useful result or a precise actionable prerequisite message.
- **Documentation:** permissions matrix, cost caveats, examples, known limitations, SDK versions and troubleshooting.

A feature is **complete** only when its command/tool has working implementation, tested success and failure paths, and the documentation matches actual behavior. If a particular AWS operation cannot be tested safely or the current SDK lacks a feature, classify it as **unverified/unsupported**, explain the limitation and do not fake a result.

### Suggested quality gates

- All manifests pass validation.
- No test uses real AWS resources without explicit opt-in.
- No dangerous operation bypasses an approval and policy check through supported tool paths.
- All AWS response-derived claims preserve account, region, service and observation timestamp when available.
- Every plugin includes at least one end-to-end demonstrated workflow and tests for two negative cases.
- Commands continue to work in text mode without the UI plugin.
- New changes do not break the 11 existing plugins or the marketplace loading process.

## 10. Implementation plan for Claude Code

**Do not create all 14 folders with placeholder skills and call the job done.** Work in vertical slices, validating each plugin before proceeding.

### Phase A — Inspect and establish contracts

1. Inspect existing `AGENTS.md` / `CLAUDE.md`, marketplace manifests, toolchain, plugins and tests.
2. Identify actual interfaces for `aws-context`, `aws-ui`, `aws-guard`, `aws-infrastructure`, `aws-testing` and `aws-deploy`.
3. Establish a minimal common result schema, packaging strategy, credential flow and safe operation policy.
4. Build one end-to-end reference plugin and verify local marketplace installation.

### Phase B — Core serverless services

1. `aws-lambda`
2. `aws-api`
3. `aws-auth`
4. `aws-events`
5. `aws-messaging`
6. `aws-workflows`
7. `aws-database`
8. `aws-storage`

### Phase C — Specialized services

9. `aws-streaming`
10. `aws-edge`
11. `aws-email`
12. `aws-config`
13. `aws-containers`
14. `aws-ai`

### Phase D — Cross-plugin integration and release

- Verify architecture-to-CDK handoff, context identity, security policies, UI output, test fixtures and deployment plans.
- Add optional end-to-end flows such as **API Gateway → Lambda → DynamoDB**, **EventBridge → SQS → Lambda**, **Step Functions → Lambda**, **S3 event → Lambda**, and **SES → S3/Lambda**.
- Run all regression and independent installation tests.
- Produce an implementation matrix: `not started / in progress / implemented / tested / unverified / blocked`, with evidence for each status.
- Update marketplace entries and documentation; do not announce production readiness without evidence.

## 11. Definition of done

The resulting product must allow a developer to:

- Select or verify their AWS identity.
- Install **only one** of the 14 service plugins if desired.
- Use one intuitive command to inspect a service and get a reliable grounded answer.
- Generate and validate service-specific TypeScript code and integration patterns.
- Propose infrastructure changes through the existing CDK plugin rather than duplicating it.
- Test service behavior safely, without assuming test environments are production.
- Request and approve real cloud mutations through established security/deployment controls.
- View service-specific results in text and, where available, in the existing UI.
- Diagnose failed operations with meaningful evidence, error classifications and recommended next steps.

**Success means a coherent, reliable developer experience across fourteen independent service domains — not fourteen similarly worded AI prompts.**

## 12. Source references for implementers

- Claude Code plugins: https://code.claude.com/docs/en/plugins
- Claude Code marketplace format: https://code.claude.com/docs/en/plugin-marketplaces
- AWS CDK documentation: https://docs.aws.amazon.com/cdk/v2/guide/home.html
- AWS Lambda documentation: https://docs.aws.amazon.com/lambda/latest/dg/welcome.html
- Amazon SES: https://docs.aws.amazon.com/ses/latest/dg/Welcome.html
- AWS AppConfig: https://docs.aws.amazon.com/appconfig/latest/userguide/what-is-appconfig.html
- Amazon Data Firehose: https://docs.aws.amazon.com/firehose/latest/APIReference/Welcome.html
- Amazon Bedrock AgentCore: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/

Verify these references and version/region-specific behavior at implementation time. The specification is a target design, not evidence that the plugins or tools are already implemented.

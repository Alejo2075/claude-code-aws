# Implementation Specification — Seven AWS Serverless Plugins for Claude Code

**Status:** Target design and implementation contract, not a claim that any feature is implemented.
**Scope:** Seven independently installable plugins for a pre-existing Claude Code plugin marketplace.
**Primary stack:** TypeScript, Node.js, AWS SDK for JavaScript v3, AWS CDK v2 (TypeScript), pnpm when compatible with the existing repository.

## 0. Mission and constraints

Build and production-harden these seven separate plugins:

1. `aws-architect`
2. `aws-infrastructure`
3. `aws-security`
4. `aws-testing`
5. `aws-deploy`
6. `aws-cost`
7. `aws-observability`

The repository **already contains `aws-context` and `aws-ui`**. Inspect their code, public interfaces, manifests and conventions before making changes. Do not recreate, rename or break them. Integrate with their existing context and UI contracts where possible; if integration is absent, define a minimal, versioned interface and implement a graceful CLI/text fallback. Do not rely on undocumented cross-plugin state sharing.

Focus on AWS serverless workloads built with CDK TypeScript: Lambda, API Gateway (HTTP/REST), AppSync and Cognito where relevant, DynamoDB, S3, SQS, SNS, EventBridge, Step Functions, CloudWatch, X-Ray, IAM, KMS, Secrets Manager and CloudFormation. Support additional AWS services through existing APIs when appropriate, without promising universal coverage.

Each plugin must be independently useful, discoverable and installable. **Do not turn each plugin into merely an agent**: use the right combination of skills, scripts, CLI executables, hooks, MCP servers and agents. Use UI mods from the already existing `aws-ui` instead of building separate competing UI implementations. A capability that works entirely with a script or skill does not need a custom MCP server or agent.

Favor simple commands and sensible detection over setup wizards. Never require a hosted backend or storage of AWS credentials. All external effects are explicit. Never deploy, delete, mutate, redrive, replay, stress-test production, or start costly monitoring by default.

### Key ownership boundaries

- **Architect** owns decisions and architectural artifacts; it does **not** own generating and executing CDK infrastructure.
- **Infrastructure** owns CDK TypeScript, synthesis, inspection and diff; it does **not** own actual deploy/rollback execution.
- **Security** owns audits and risk policy, including advisory/pre-tool safeguards; **IAM/SCP are the actual security boundaries**.
- **Testing** owns test generation, execution and reporting, not deployments.
- **Deploy** owns controlled rollout/pipeline execution and rollback plans.
- **Cost** owns estimates, actual cost analysis, trends and savings recommendations; never imply estimates are invoiced actuals.
- **Observability** owns telemetry queries and incident investigations; not budget or billing analytics, which belong to Cost.

## 1. Shared developer experience

**Minimum UX conventions** for every plugin:

- Natural-language activation plus 3–6 memorable namespaced commands.
- `help` (or README quick start) with a 30-second workflow, prerequisites, minimum permissions, and example.
- Auto-detect project, account, profile, region and scope from `aws-context`, explicitly surfacing any unverified context.
- Return a short human summary first; provide detailed evidence and machine-readable JSON as an option.
- Support `--dry-run`/`--plan` when an operation can mutate state; require a separate explicit execution action.
- Fail clearly when AWS access, required data, CLI tools or permissions are unavailable, including the precise missing capability and a practical recovery step.
- Operate with no AWS account for supported static/local features and with read-only AWS access for inspection.
- Require confirmation of exact AWS account, region, resource identifiers and impact before changing real resources.
- Never assume `prod` vs `dev` solely from the profile's name; verify STS account identity and apply user-defined environment policy.
- Protect secrets, auth tokens, message payloads, PII and log samples through output redaction and data minimization. Do not commit them to reports, fixtures or recordings.
- Bound AWS list/query operations by explicit resource scope, time range, result size, concurrency, timeout and retry policy. Explain potential AWS API or telemetry costs where relevant.
- Plain-text output must remain useful if `aws-ui`, mods or optional MCP tools are not installed.

### Shared result contracts (proposal, not an existing API)

Prefer a small common result schema, only after inspecting existing code:

```ts
type ExecutionContext = {
  accountId?: string;
  region?: string;
  profile?: string;
  identityVerified: boolean;
  environment?: "development" | "staging" | "production" | "unknown";
};

type Finding = {
  id: string;
  plugin: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  explanation: string;
  affectedResources?: string[];
  evidence: { type: string; reference: string; observedAt?: string }[];
  recommendation?: string;
  confidence?: "low" | "medium" | "high";
};

type AnalysisReport = {
  schemaVersion: "1";
  plugin: string;
  generatedAt: string;
  context: ExecutionContext;
  mode: "local" | "read-only-cloud" | "planned-change" | "executed-change";
  summary: string;
  findings: Finding[];
  limitations: string[];
};
```

Use separate typed schemas where appropriate for diagrams, infrastructure diffs, test reports, deployment events, cost estimates and telemetry time series. Support schema validation and forward-compatible versioning. `aws-ui` should consume these reports via an explicit integration, never by assuming private variables from another plugin.

### Architecture and packaging

- Each plugin belongs under `plugins/<name>/` with its own `.claude-plugin/plugin.json`, README, components and locally packaged executable code as applicable.
- Register all seven in the existing `.claude-plugin/marketplace.json`, preserving existing plugin entries.
- Use official component paths and syntax as verified against the installed Claude Code version and current documentation.
- Reuse official AWS SDK / CDK / CLI capabilities. Prefer AWS-native APIs and tooling to duplicated implementations.
- Share TypeScript packages only where duplication demonstrably exists. Build distributable runtime artifacts into each plugin: plugin cache copies must not depend on arbitrary `../../packages` imports outside the installed plugin.
- Use versioned dependencies/lockfiles, reproducible builds and scoped IAM permission documentation.
- Document plugin-to-plugin integration as optional or a declared dependency; avoid circular or mandatory dependencies beyond validated shared runtime needs.
- Avoid requiring a top-level generic MCP server. Provide a plugin-local MCP server **only when structured tools materially improve outcomes** over CLI commands or installed AWS integrations.
- Treat hooks as best-effort integrations with Claude Code, not an authoritative authorization perimeter.

## 2. Plugin: aws-architect

**Mission:** Convert user requirements or an existing serverless project into well-reasoned AWS architectures, with a maintainable design that infrastructure and development tools can implement.

**Primary components:** Specialized **agent** `serverless-architect`; **skills**; local diagram/ADR generators and documentation lookups; optional integration with existing MCP documentation sources. No default custom cloud-write tools.

**User commands:** `/aws-architect:design`, `review`, `diagram`, `compare`, `evolve`.

**Complete target scenarios:**

- Greenfield design; assess brownfield code/CDK stacks; compare as-is and to-be; incremental modernization and migration planning.
- Analyze functional requirements, expected traffic and peak concurrency, latency/SLO, data consistency, retention, sovereignty/regional requirements, auth and tenancy, resilience/RTO/RPO, costs and team constraints.
- Choose service integration vs Lambda, HTTP API vs REST API vs GraphQL, synchronous vs asynchronous, SNS/SQS/EventBridge, Standard vs Express Step Functions, DynamoDB vs relational options when serverless-relevant.
- Cover event sourcing/outbox where needed; idempotency, duplicate delivery, ordering, backpressure, partial batch failures, retries, DLQs, poison messages and workflow compensations.
- Map trust boundaries, authz, sensitive data, encryption, secrets, least-privilege, account separation and tenant isolation.
- Capture operational plan: observability, alarm/SLO design, cost drivers, deployment strategy, failure paths, quotas and scaling risks.
- Review against six Well-Architected pillars and Serverless Applications Lens, giving justified trade-offs and evidence/citations where available, not invented recommendations.
- Produce architecture descriptions, Mermaid diagrams, ADRs, implementation plan, clear module boundaries, security assumptions and prioritized risks.
- Hand off a well-defined plan to `aws-infrastructure` while remaining independent if that plugin is absent.

**Expected artifacts:** `docs/architecture/overview.md`, `decisions/*.md`, optional `diagram.mmd`, and an implementation plan, only upon explicit request to write files.

**Acceptance examples:** design a serverless authenticated API, an S3 ingest pipeline, a fan-out processing workflow and a multi-tenant SaaS API; review an existing CDK repo. Show tradeoffs, failure paths and realistic boundaries, not just a service list. Never silently modify cloud resources.

## 3. Plugin: aws-infrastructure

**Mission:** Build and maintain production-quality CDK v2 TypeScript infrastructure while making changes predictable and understandable. CDK remains the default and first-class IaC framework.

**Primary components:** **Skills + packaged CLI/TypeScript analyzers**; **MCP** tools for typed project/stack/graph/diff inspection only if justified; optional read-only `cdk-reviewer` subagent for complex changes. Integrate with `aws-ui` for graphs/diffs.

**User commands:** `/aws-infrastructure:init`, `scaffold`, `inspect`, `synth`, `diff`, `review` (with `refactor` available if implemented).

**Complete target scenarios:**

- New apps and existing repos; multiple stacks/stages/environments; L2 constructs and well-justified L3 patterns; resource composition; naming, tags and dependency boundaries.
- Scaffold Lambda, API Gateway, DynamoDB, S3, Cognito, SQS, SNS, EventBridge, Step Functions and standard serverless integrations using secure defaults.
- `cdk synth`, template validation, structured CloudFormation resource inventory, architecture/resource dependency graph and deterministic outputs.
- Analyze `cdk diff`, distinguishing template-only analysis from change-set-backed replacement assessment; indicate uncertain replacement risk instead of claiming certainty.
- Flag data loss and risky migrations (DynamoDB table replacement, S3 bucket replacement, logical ID changes, schema/index changes, deletion/retention policies, custom resource changes).
- Examine resource policies, IAM grants, env variables, encryption, timeouts, DLQs, observability, alarms, cycles, asset packaging and cross-stack dependencies.
- Multi-account/multi-region design; CDK bootstrap prerequisites; context lookups and cross-account permissions, without automatically bootstrapping or deploying.
- Evaluate drift with supported CloudFormation mechanisms, and clearly distinguish declared vs actual infrastructure.
- Refactor existing constructs while preserving resource identities when feasible; explain breaking changes before code edits.
- CDK version compatibility checks and safe upgrade path with lockfile awareness.

**Outputs:** synth/diff report, resource graph, risk rating, file references, proposed code patches and migration guidance. For any action whose analysis itself may write AWS artifacts (e.g. change sets), explain and request necessary authorization.

**Acceptance examples:** synth a queue-to-Lambda-to-DynamoDB architecture; catch destructive replacement; handle a failed synth with actionable diagnostics; compare two deployment environments; show a safe refactor that avoids unnecessary logical ID changes. **Actual deploy is reserved for `aws-deploy`.**

## 4. Plugin: aws-security

**Mission:** Provide evidence-based security reviews and guardrails for serverless application code, CDK infrastructure and optionally deployed AWS resources.

**Primary components:** **Agent** `serverless-security-reviewer` (read-only by default); **skills**; static and AWS read-only **tools/MCP where necessary**; narrow **hooks** for risk checks. Use existing UI to show findings. Avoid redundant runtime checks across plugins.

**User commands:** `/aws-security:audit`, `iam`, `auth`, `threat-model`, `remediate`.

**Complete target scenarios:**

- IAM identity/resource policies, trust policy, `PassRole`, permission boundaries, cross-account role access and least-privilege checks; investigate `AccessDenied` using supported evidence.
- Lambda execution roles, env vars, network access, dependency/supply-chain vulnerabilities, runtime support and secure logging.
- API Gateway authorizers, JWT/Cognito configuration, CORS, API policies, authorization coverage, authentication vs authorization distinction and abuse/rate-limiting considerations.
- DynamoDB and S3 resource exposure, public-access settings, encryption, KMS policies, event policies, secret storage and rotation where appropriate.
- Tenant isolation, identity propagation, data leakage in logs/traces, CloudTrail and auditability, credential handling.
- Scan CDK templates and code with supported static analysis (e.g. validated cdk-nag/other tools if suitable), plus optional IAM Access Analyzer/Security Hub read-only findings when available.
- Prioritize findings by severity and exploitability, include exact resource/file evidence, and distinguish confirmed issues from hypotheses.
- Provide a proposed, minimal, testable remediation; do not make policy relaxations or changes without explicit authorization.
- PreToolUse or permission-related hooks may warn/ask/deny recognized sensitive AWS operations, but are **defense in depth**, not an AWS permission replacement.
- Optional exclusions must be visible, scoped, expiring when appropriate, documented and never silently bypass critical protections.

**Acceptance examples:** detect `*` IAM grants, exposed S3, missing auth on sensitive routes, cross-account trust errors, a secret accidentally logged and a remediation that passes regression tests. Verify that hooks do not block harmless reads unnecessarily and that IAM still governs access.

## 5. Plugin: aws-testing

**Mission:** Make quality verification automatic, reproducible and comprehensive for serverless applications and CDK infrastructure.

**Primary components:** **Skills + packaged CLI test runner/adapters + optional hooks**. Optional temporary read-only testing subagent for complex coverage reports; no always-on agent required.

**User commands:** `/aws-testing:run`, `generate`, `integration`, `contracts`, `coverage`, `load`.

**Complete target scenarios:**

- Unit tests for business logic, Lambda handlers and AWS SDK boundaries using project-compatible test framework (Vitest/Jest or existing tooling).
- CDK template assertions, snapshots where appropriate, custom validation and checks for encrypted resources, IAM actions, alarms, retention and removal policies.
- Local event fixtures for API Gateway HTTP/REST, EventBridge, SQS, SNS, DynamoDB Streams, S3 and Step Functions; schema/contract tests, negative tests and fuzz/property-based cases where useful.
- Integration tests against isolated, disposable dev/test AWS accounts/stacks only after explicit approval; deterministic setup/teardown, resource and cost limits.
- E2E API validation including authn/authz, multi-tenant isolation, error and timeout behavior, API pagination and throttling.
- Async edge cases: duplicate events, idempotency, partial batch failures, DLQ, retries, out-of-order delivery, poison messages and backpressure.
- Deployment-related smoke tests as read-only verification hooks for `aws-deploy`; no unilateral rollout/rollback.
- Optional controlled performance/load tests: concurrency limits, budgets, environment allowlist, duration and stop conditions; never load-test production by default.
- Select affected tests after a code edit; prevent noisy infinite hook loops, frequent full-suite reruns or writes outside the repo.
- Generate coverage reports and test failure explanations tied to files, without calling a mock equivalent to AWS integration coverage.

**Acceptance examples:** test a Lambda/SQS consumer with duplicate messages and one failing batch member, test CDK IAM assertions, detect API auth regression and run opt-in ephemeral integration tests with cleanup and verifiable status.

## 6. Plugin: aws-deploy

**Mission:** Safely deliver serverless CDK applications to target AWS environments, with transparent review and traceable, controlled execution.

**Primary components:** **Skills + packaged CLI + hooks** for preflight/approval; optional structured MCP for deployment status; consume `aws-ui` to display status. No default autonomous deployment agent.

**User commands:** `/aws-deploy:preflight`, `plan`, `deploy`, `status`, `rollback`, `pipeline`.

**Complete target scenarios:**

- Resolve verified account/region/role, selected stacks and stage; detect missing/expired AWS credentials and bootstrap requirements.
- Check synth, diff, lint/tests, security findings, resource replacement/deletion risk, asset builds, dependencies and environment policy.
- Present plan for review with exact changed resources and estimated risk; distinguish local template diff from CloudFormation change-set-backed evidence.
- Require explicit approval of environment, account, region, stacks and irreversible operations. Fail closed when identity/impact is ambiguous.
- Support CloudFormation/CDK deployments, stack ordering, change sets, status events, failure diagnostics and bounded retries.
- Design CI/CD examples for GitHub Actions / CDK Pipelines with OIDC and least-privilege; avoid hardcoded long-lived access keys.
- Support dev/staging/production stages, approvals, protected branch guidance, artifact traceability, drift awareness and reproducible builds.
- When applicable support Lambda versions, aliases, CodeDeploy traffic-shifting/canary/linear approaches, smoke checks and automated rollback mechanisms — only where services and deployment configuration actually permit them.
- Plan recovery for failed updates, incomplete rollback, and stack deletion protection; do not promise generic rollback for DynamoDB/S3 data loss, schema changes or other irreversible modifications.
- Never use CDK hotswap in production by default; warn about drift in development.
- Ensure operational logs do not expose secrets or deployment credentials.

**Acceptance examples:** safe dev deployment to a fixture environment, production plan with destructive-change gate, deliberate failed change-set handling, progress/status reporting and a rollback plan clearly identifying non-reversible changes.

## 7. Plugin: aws-cost

**Mission:** Help developers understand and optimize the economics of serverless workloads, using clearly separated estimates, observed spend and scenario forecasts.

**Primary components:** **Skills + a constrained read-only MCP/SDK tool layer**; optional agent `serverless-cost-analyst` for tradeoff investigations; output charts through existing `aws-ui` if available.

**User commands:** `/aws-cost:estimate`, `analyze`, `optimize`, `compare`, `budgets`.

**Complete target scenarios:**

- Architecture-level estimation with explicit inputs: requests, durations, memory, data volume, storage, request sizes, retries, workflow transitions and region; include assumptions, rate date and exclusions.
- Usage and spend analysis via Cost Explorer and budgets when permissions/data exist; optional CUR/Athena or supported resource-level detail, respecting query charges and visibility limitations.
- Compute economic tradeoffs among Lambda runtime/memory/concurrency, API Gateway variants, DynamoDB on-demand/provisioned, SQS/EventBridge, SNS, Step Functions Standard/Express, S3 storage class/lifecycle, CloudWatch ingestion/retention and NAT/network transfer when applicable.
- Analyze spikes and anomalies by time period, account, service and tags where available; identify attribution gaps instead of fabricating per-resource cost figures.
- Detect wasteful log verbosity/retention, avoidable retries, long-running functions, unused capacity, duplicated events and oversized resources using measured evidence when available.
- Budget and threshold recommendations, sensitivity analysis, scenario comparisons and optional estimation of future bill under explicit assumptions.
- Distinguish **estimated vs forecast vs actual/billed**, include report timestamps, explain AWS data latency, incomplete dimensions, credits/free-tier/tax exclusions, and potential API query charges.
- Never change capacity, delete resources or alter retention automatically. Recommendations should include operational and reliability tradeoffs.

**Acceptance examples:** estimate an API+Lambda+DynamoDB workload, compare Step Functions variants, identify a log-ingestion spike, and gracefully report insufficient Cost Explorer permissions without inventing numbers.

## 8. Plugin: aws-observability

**Mission:** Provide reliable operational visibility and guided root-cause investigation for deployed serverless applications.

**Primary components:** **Agent** `serverless-incident-investigator` for multi-source investigations; **skills + scoped read-only MCP/SDK tools**; optional **monitor** only when deliberately configured and supported; UI outputs through `aws-ui`.

**User commands:** `/aws-observability:status`, `logs`, `metrics`, `trace`, `investigate`, `alarms`.

**Complete target scenarios:**

- Inspect Lambda logs, errors, duration, throttling, concurrency, cold-start signals where instrumentation permits, and execution configuration.
- CloudWatch Logs Insights queries with bounded time range, result count, query concurrency and sensible cost warnings.
- Analyze API Gateway 4xx/5xx and latency, DynamoDB throttling, SQS age/backlog/DLQ, EventBridge delivery failures and Step Functions execution history, subject to available telemetry.
- Correlate CloudWatch metrics, structured log IDs, X-Ray traces and application-generated correlation IDs across services where instruments allow; distinguish inferred architecture flow from observed request traces.
- Guided incident diagnosis: timeline, affected resources, symptom, evidence, candidate causes, confidence, suggested next checks and remediation steps.
- Recommend observability instrumentation and metrics/alarm baselines using supported AWS Powertools tools and appropriate correlation/trace propagation.
- Alarm inventory, SLO/SLI discussion, error budgets and post-incident review reports; avoid creating alarm resources unless explicitly requested through an authorized infrastructure/deploy workflow.
- Optional opt-in monitors with configurable polling windows, limits and AWS charges. No hidden daemon/continuous polling by default.
- Guard PII/security-sensitive payloads and apply truncation/redaction for sample logs. Read-only diagnosis unless a separate explicitly approved change workflow is invoked.

**Acceptance examples:** investigate a Lambda timeout using logs and metrics, a backed-up SQS queue with an unhealthy consumer, a failing Step Functions execution and missing trace instrumentation. Return evidence timestamps, uncertainty and query limits; never state a root cause without evidence.

## 9. Cross-plugin scenario matrix

Deliver fixtures, integration tests and evals for at least these end-to-end scenarios:

| Scenario                                    | Expected plugins                                     | Key checks                                             |
| ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Authenticated serverless API                | Architect, Infrastructure, Security, Testing, Deploy | API auth, IAM, CDK assertions, safe deploy             |
| S3 ingestion to queue and Lambda            | Architect, Infrastructure, Testing, Observability    | Idempotency, retries, queue backlog, DLQ               |
| Multi-account staging vs production         | Infrastructure, Security, Deploy                     | Verified identities, permissions, approvals            |
| DynamoDB migration with replacement risk    | Infrastructure, Deploy, Testing                      | Risk analysis, data migration/rollback limitation      |
| SQS message duplication and partial failure | Testing, Observability, Architect                    | Correct batch semantics and evidence                   |
| Unexpected serverless bill increase         | Cost, Observability                                  | Billed vs observed signals and attribution gaps        |
| Role with excessive permission              | Security, Infrastructure                             | Least-privilege fix without breaking tests             |
| Lambda latency regression                   | Observability, Testing, Cost                         | Evidence, reproducible test, cost-performance tradeoff |

Add test fixtures for expired SSO, access denied, absent AWS CLI, no account, unsupported region/service, AWS throttling, paginated data, missing instrumentation and failed/partial CloudFormation operations. No tests against production by default.

## 10. Development and release process

**Do not generate seven empty folders with placeholder README files and call the task finished.** Build one complete vertical slice at a time, with real behavior, tests and documentation before proceeding to the next plugin. Preserve existing repository conventions unless there is an explicit technical reason to change them.

Suggested order: **Infrastructure → Architect → Security → Testing → Deploy → Observability → Cost**. Dependencies may justify a different local ordering, but keep all seven as distinct marketplace plugins.

For each plugin:

1. Inspect the existing repo, existing `aws-context`/`aws-ui` public contracts and the current official Claude Code plugin/mod/MCP APIs.
2. Write a short implementation plan mapping commands to agents, skills, hooks, tools and data sources. Prefer the simplest supported extension mechanism.
3. Implement the real commands, local analyzers and AWS integrations with safe resource scoping, typed errors and bounded API use.
4. Add realistic sample projects/test fixtures and unit/integration tests. Add agent evaluations for factuality, task selection and permission discipline where agents exist.
5. Validate the plugin and marketplace using official Claude Code validation commands. Check installation from local marketplace and independent operation without optional companion plugins.
6. Document quick start, examples, IAM permissions, limitations, supported project/service versions and expected costs of AWS API use.
7. Use structured results consumable by `aws-ui` where possible; verify text fallback remains functional.
8. Report what was **actually executed and verified**, what remains untested, and what requires a real dev AWS account or manual approval.

**Release gate (all must pass before claiming complete):** manifest valid; locally installable; commands discoverable; successful representative fixture; error-path coverage; AWS identity safeguards; no secrets leaked; no default cloud writes; tests green; user-facing docs; at least one scenario-specific integration/evaluation; output examples grounded in real fixture or AWS data; no unsupported feature silently claimed.

### Deliverables

- Seven functional plugin directories registered in the existing marketplace.
- Scoped agents and skills with good descriptions and tool permissions where useful.
- Packaged runnable CLI/MCP components only where necessary.
- Automated test suite, fixtures, evals and CI validation.
- Shared data schemas and optional `aws-ui` integration without mandatory UI dependence.
- Documentation and examples for each plugin, plus end-to-end scenario examples.
- A final implementation matrix: each promised capability marked `implemented + tested`, `implemented + unverified`, or `not yet implemented`; explicitly identify gaps.

## 11. Official technical references to check during implementation

Claude Code:

- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins/components
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/plugins/mods
- https://code.claude.com/docs/en/plugin-marketplaces

AWS:

- https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/
- https://docs.aws.amazon.com/cdk/v2/guide/
- https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-diff.html
- https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
- https://docs.aws.amazon.com/cost-management/latest/userguide/ce-api.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-cdk-typescript-iac/development-best-practices.html

Check actual installed software versions and documentation at implementation time. Do not assume that all proposed integrations are supported in every Claude Code environment or that AWS service capabilities, fees or availability are identical in all regions.

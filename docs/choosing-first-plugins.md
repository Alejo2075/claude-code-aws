# Choosing the first plugins

The foundation is ready: a plugin scaffolded with `pnpm new:plugin` builds, tests, validates, releases, and installs from the marketplace on macOS, Linux, and Windows. This guide helps decide **what to build first**. It is decision support, not a decision: the maintainer chooses.

## Selection criteria

Score each candidate against these criteria. They come straight from [CLAUDE.md](../CLAUDE.md).

1. **Novel and deterministic.** Does it add something that official AWS plugins, MCP servers, the AWS CLI, or CDK do not already provide? Testable code beats prompt-only knowledge.
2. **Safety-first ordering.** Identity and policy boundaries must exist and be tested before any mutation path ("Security-sensitive paths must be implemented and tested before enabling mutating operations").
3. **Read-only first slice.** The first release of every plugin should be `read` or `local-write`.
4. **Fixture-testable.** Can it be tested with realistic fixtures and mocks, without a live account?
5. **Independently useful.** Is it valuable installed alone?
6. **Proves the platform.** Does it exercise real platform surfaces: hooks, the bundled AWS SDK, skills, agents?

## The existing ecosystem: avoid duplication

Official AWS plugins are already available in Claude Code. In this environment they include `aws-core` (CDK, CloudFormation, IAM, serverless, observability, billing, and SDK skills), `aws-cdk`, `aws-serverless`, `deploy-on-aws`, `aws-cost-ops`, and `databases-on-aws`, plus AWS MCP servers for documentation, IaC, pricing, and DynamoDB. They mostly supply **knowledge and service access**.

What they do not supply, and what CLAUDE.md asks for, is **deterministic, verified, safety-oriented local logic**:

- verified identity and target context, with provenance;
- local policy decisions on AWS-affecting tool calls;
- machine-informed classification of infrastructure changes (replace and delete of stateful resources);
- an evidence-based preflight report.

The strongest first plugins live in that gap. Knowledge-style plugins (generic IAM advice, cost tips, serverless patterns) would mostly duplicate official ones. They should come later, if at all, and only with a deterministic core.

## Candidates

Effort: S is about one focused week, M two to three weeks, L more than that, for one developer including tests, evals, and docs.

| #   | Candidate (placeholder name) | What the first slice does                                                                                                                                                                                                                                                                                                                                                                    | Side effects                     | Novel vs. official tools                                               | Effort | Depends on                                 |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- | ------ | ------------------------------------------ |
| A   | `context`                    | Detects the project type (CDK, SAM, CloudFormation, Terraform, Serverless Framework) from files, with evidence. Resolves profile and region through the SDK chain, verifies account and principal with STS, and applies the user's environment classification. Delivered through a SessionStart `additionalContext` summary, a `/context:show` skill, and a documented `statusLine` snippet. | read                             | High: verified identity with provenance and explicit unverified states | S–M    | none                                       |
| B   | `guard`                      | A `PreToolUse` hook on Bash, fail-closed, that classifies AWS CLI, CDK, SAM, CloudFormation, and Terraform commands as read, local, mutate, destroy, or unknown. Returns `allow`, `ask`, or `deny` from a local policy file with machine-readable reasons. Denies mutation when identity is unverified or the target is production without approval. Documents its coverage limits.          | read (it decides; it never acts) | High: deterministic local policy                                       | M      | identity logic from A, as a shared package |
| C   | `cdk-review`                 | Runs or ingests `cdk synth` / `cdk diff` / CloudFormation change set JSON. Classifies create, update, replace, delete, and unknown, and flags stateful replacements, IAM broadening, and public exposure. Includes a read-only review agent.                                                                                                                                                 | local-write (synth output)       | High: change-impact classification with uncertainty                    | M–L    | none (A is helpful)                        |
| D   | `preflight`                  | Combines verified identity, local tests, diff classification, and policy decisions into one evidence-based report with explicit unknowns. Never deploys.                                                                                                                                                                                                                                     | read                             | High, but it is a composition                                          | M      | A, B, C                                    |
| E   | `iam-review`                 | Least-privilege proposals from code and CloudTrail evidence                                                                                                                                                                                                                                                                                                                                  | read                             | Medium: overlaps `aws-core:aws-iam`                                    | M      | A                                          |
| F   | `cost-review`                | Cost drivers from templates, with qualified estimates                                                                                                                                                                                                                                                                                                                                        | read                             | Low to medium: overlaps `aws-cost-ops` and the pricing MCP             | M      | A                                          |
| G   | `observability`              | Failure investigation over CloudWatch and X-Ray evidence                                                                                                                                                                                                                                                                                                                                     | read                             | Low to medium: overlaps `aws-core:aws-observability`                   | M–L    | A                                          |

## Recommended sequence

This matches ROADMAP Milestones 1 and 2.

1. **A — context.** It is the lowest-risk, highest-leverage first release. It proves bundling the AWS SDK, STS verification, SessionStart hooks, a skill, and the status-line fallback, end to end on all three operating systems. It is useful alone: every AWS session starts with a verified "who and where am I".
2. **B — guard.** This is the core safety promise, and it gates everything that could mutate. Before it ships, extract identity and project detection from A into `packages/aws-context`, bundled into both plugins. Two plugins now need the code, which meets CLAUDE.md's rule for shared packages.
3. **C — cdk-review.** This is the first infrastructure workflow and the first specialist agent. It is fixture-heavy, so start collecting sanitized `cdk diff` and change set fixtures early.
4. **D — preflight.** It composes A, B, and C into the pre-deployment report. A deploy workflow is considered only after this, as an explicitly authorized, manual skill.

E, F, and G come later, chosen by demand, each needing a deterministic core that official plugins lack.

**Alternative:** ship A and B as **one** plugin (`context` with guard hooks). It is simpler to release and install. The cost is that users cannot have context without the guard, and policy changes would force context updates. Two plugins plus a shared package keeps them independently installable, which CLAUDE.md prefers.

## Decisions needed before starting candidate A

| Question                                                           | Options                                                                                    | Recommendation                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Final plugin names (the install id, which is hard to change later) | `context`, `aws-context`, …                                                                | Short and kebab-case. Must pass `checkPluginName`. Renames need a `renames` entry.                  |
| Where environment classification lives                             | `userConfig` option, a project file (for example `.claude/aws-environments.json`), or both | A project file committed with the repository, with a user-level fallback in `${CLAUDE_PLUGIN_DATA}` |
| What the SessionStart summary may reveal                           | account ID, principal ARN, region, profile name                                            | Account ID, region, and profile name, plus a masked principal. Make full ARN display opt-in.        |
| Behavior when STS is unreachable or credentials are expired        | warn, or warn and mark mutation-unsafe                                                     | Warn and mark it as `unverified`. B later denies mutations in that state.                           |
| Multiple profiles or accounts in one repository                    | report the active one only, or also enumerate configured profiles                          | Report the active one only; enumerating profiles reads more local config than needed.               |

## First-slice checklist (candidate A)

- [ ] Proposal issue opened with the plugin proposal template
- [ ] `pnpm new:plugin <name> "<description>"` run, and the README contract written first
- [ ] `src/lib`: project detection with evidence, plus SDK-chain identity resolution through STS `GetCallerIdentity`, with injectable clients for tests
- [ ] Negative tests: no credentials, expired SSO token, wrong region, AccessDenied on STS, network timeout, no project files
- [ ] SessionStart hook (advisory, fails open) and a `show` skill; output passes `findSecretLikeStrings`
- [ ] `statusLine` snippet documented in the README
- [ ] Evals: the skill triggers on "what AWS account am I using?" and never runs mutating commands
- [ ] Optional sandbox integration test: STS against the sandbox account
- [ ] Changeset `minor`, then merge the Version PR. The first real release exercises the publish, tag, and smoke jobs.

# Implementation plan

This plan implements the target in `CLAUDE.md` as tested vertical slices. It does not select sample applications, articles, tutorials, or other editorial content. Only working modules enter the marketplace.

## Milestone 0: repository foundation

1. Establish the license, README, contribution and security policies, code of conduct, issue and pull request templates, and release policy.
2. Initialize Git, protect the default branch, require CI and review, and use signed, scoped releases where hosting supports them.
3. Add a pnpm workspace with TypeScript, strict type checking, formatting, linting, and deterministic tests when the first implementation needs it. Pin Node and pnpm versions; commit the lockfile. Avoid empty package directories.
4. Add CI for formatting, types, tests, secret scanning, and package validation. Keep CI free of AWS credentials and cloud mutations.

**Exit:** repository guidance is complete, contributions are reviewable, and CI can validate the actual code present.

## Milestone 1: first installable context and guard slice

1. Confirm current Claude Code plugin, marketplace, hook, and status-line contracts against official docs and the supported installed versions.
2. Implement one self-contained plugin with a valid manifest, a local marketplace entry, a context skill/command, and a deterministic `PreToolUse` policy hook limited to its documented coverage.
3. Detect supported project types from local files with evidence. Resolve selected AWS profile and region without reading or printing credential contents. Verify account and principal through STS `GetCallerIdentity`; show unverified state on failure.
4. Implement typed operation classes and `allow`, `ask`, `deny` decisions. Deny automated cloud mutation when identity or target is unclear. Test wrong account, wrong region, expired credentials, missing permissions, risky operations, and secret redaction using fixtures and mocks.
5. Package the plugin so it runs from a copied cache directory. Test local plugin loading, marketplace registration/install, hook behavior, disable/uninstall behavior, and text fallback on supported platforms.
6. Document install, setup, credential handling, configuration, limitations, and IAM/SCP boundaries. Never describe hook coverage as comprehensive enforcement.

**Exit:** a clean Claude Code installation can install the plugin, see a verified or explicitly unverified AWS context, and receive a tested policy decision for covered operations. No mutation workflow is enabled.

## Milestone 2: CDK review and delivery preflight

1. Add CDK review only after Phase 1 is stable. Parse machine-readable synth/diff output and classify create, update, replace, delete, and unknown changes. Use fixtures for stateful resources, IAM expansion, partial output, and failures.
2. Add one narrowly scoped read-only architecture or CDK review agent where delegated context improves the workflow. Define inputs, outputs, tools, and constraints.
3. Produce an evidence-based preflight report combining verified identity, local validation, diff, destructive risks, unknowns, and required approval. Do not perform deployment in a review skill.
4. Test a packaged plugin from outside the monorepo, including an unavailable CDK executable and denied AWS access.

**Exit:** a user can review a CDK change and obtain a preflight report with clear evidence and uncertainty.

## Milestone 3: authorized delivery and wider lifecycle

1. Implement deployment only after identity and policy tests pass. Require the user's explicit target and approval; execute with existing least-privilege credentials, verify the result, and provide recovery steps. Test against mocks by default; use an isolated AWS test account only when explicitly configured and authorized.
2. Add serverless build/debug, IAM/security, observability, and cost workflows one at a time. Each needs a useful outcome, failure handling, fixtures, packaged-plugin test, and documentation before listing it in the marketplace.
3. Label actual billing data, estimates, and hypothetical savings separately. Bound inventory and telemetry queries by account, region, time, pagination, and permissions.
4. Add optional official AWS MCP integrations where they improve a workflow. Keep them opt-in and never install or authorize them silently.

**Exit:** each released plugin is independently useful and safe under missing permissions, missing data, and uninstall.

## Milestone 4: expansion

Add network, data, testing, and delivery specializations based on demonstrated demand. Explore in-process mods and richer UI only after their underlying analysis is reliable; keep textual fallbacks. Expand compatibility and evaluation suites before claiming broad platform support.

## Commit strategy

Use small conventional commits, one reviewable behavior per commit. Suggested sequence:

1. `docs: establish OSS repository guidance and roadmap`
2. `chore: add pinned workspace and CI checks`
3. `feat(context): detect local project and verified AWS identity`
4. `test(context): cover identity and permission failures`
5. `feat(guard): add typed policy decisions and covered hook`
6. `test(guard): cover risky operations and hook failures`
7. `feat(plugin): package and register first marketplace plugin`
8. `docs: add installation and security limitations`
9. `feat(cdk): add evidence-based diff review`
10. `feat(delivery): add read-only preflight report`

Use `fix`, `test`, `docs`, `chore`, and `refactor` as appropriate. A feature and its tests can share a commit when they form one coherent change. Keep generated artifacts out of Git unless needed for distribution. Run the relevant checks before each commit and require CI before merge. Use tagged releases with a changelog and release notes; publish only plugins that pass the installed-directory check.

## Cross-cutting acceptance criteria

- Manifest and marketplace validation pass against supported Claude Code versions.
- Every released workflow documents preconditions, inputs, side effects, outputs, and failure behavior.
- Deterministic logic has unit tests; AWS interactions use realistic fixtures or mocks by default.
- Secret material is never printed or persisted; external telemetry is off by default.
- Read-only and mutating workflows are separate, and explicit approval precedes any cloud mutation.
- Disabling or uninstalling a plugin leaves normal Claude Code behavior intact.

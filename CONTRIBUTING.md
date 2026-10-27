# Contributing

Read [CLAUDE.md](CLAUDE.md), [docs/ROADMAP.md](docs/ROADMAP.md), and [docs/plugin-authoring.md](docs/plugin-authoring.md) before proposing a feature.

## Propose

Open an issue with the **Plugin or workflow proposal** template. Describe the user workflow, the expected outcome, the AWS permissions involved, the side effects, the failure cases, and why an existing Claude Code or AWS tool is insufficient.

## Develop

Requirements: Node.js 22+ (24 recommended, see `.nvmrc`), pnpm through Corepack or a pnpm that honors `packageManager`, git, and Claude Code 2.1.295+.

```sh
pnpm install
pnpm new:plugin <name> "<one-line description>"   # new plugins only
pnpm verify                                       # what CI runs
```

Keep pull requests focused on one working slice. Include deterministic tests, including negative cases. Document installation, side effects, permissions, limitations, and compatibility in the plugin README. Add a changeset (`pnpm changeset`) when you change what a released plugin ships.

Never include credentials, account IDs, ARNs, private logs, or real customer infrastructure in code, fixtures, issues, or pull requests. Do not run cloud-mutating tests against a contributor account. The default test suite uses fixtures and mocks only.

## Commits and review

Use conventional commit messages, such as `feat(context): verify AWS identity`. Pull requests are squash-merged after the required checks pass. Maintainers review security boundaries, plugin independence, evidence quality, and compatibility before merging. Public contributions are accepted under the repository license.

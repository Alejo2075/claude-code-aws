# Contributing

The project is in its foundation stage. Read [CLAUDE.md](CLAUDE.md) and [docs/ROADMAP.md](docs/ROADMAP.md) before proposing a feature.

Open an issue describing the user workflow, expected outcome, AWS permissions, failure cases, and why an existing Claude Code or AWS tool is insufficient. Keep pull requests focused on one working slice. Include tests for deterministic behavior and document installation, side effects, limitations, and compatibility. Never include credentials, account-specific data, private logs, or real customer infrastructure in fixtures.

Use conventional commit messages such as `feat(context): verify AWS identity`. Run the checks defined by the package scripts once the implementation exists. Do not run cloud-mutating tests against a contributor account; the default test suite must use fixtures and mocks.

Maintainers will review security boundaries, plugin independence, evidence quality, and compatibility before merging. Public contributions are accepted under the repository license.

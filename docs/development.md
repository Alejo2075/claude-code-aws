# Development

## Prerequisites

- Node.js 22.12 or later
- pnpm 10.34.8 through Corepack
- Git
- Claude Code 2.1.295 or later for plugin validation and installation checks

## Set up and verify

```sh
corepack enable
pnpm install
pnpm verify
```

`pnpm verify` runs formatting, lint, type checking, plugin builds, unit and integration tests, mod tests, manifest validation, release packaging, and release-flow self-tests.

The default checks use fixtures and mocks. They do not deploy to AWS or run cloud-mutating tests against your account.

## Develop a plugin

Create a scaffold with:

```sh
pnpm new:plugin <name> "<short description>"
```

The scaffold is created under `plugins/development/services/<name>` at version `0.0.0`. Move it to its final category folder before submitting it. If the folder depth changes, update the relative paths to the root scripts and `tsconfig.base.json` in `package.json` and `tsconfig.json`.

A plugin normally contains:

```text
.claude-plugin/plugin.json
package.json
src/                 # deterministic implementation and executable entry points
skills/              # on-demand workflows
agents/              # focused delegated workers, when useful
hooks/               # lifecycle automation, when appropriate
test/                # unit, contract, and negative tests
evals/               # behavior evaluations, when appropriate
README.md            # capability, permissions, side effects, limitations
```

Keep plugins independently loadable. Bundle shared code at build time and do not reference sibling packages from installed plugin files. Add tests for error, permission, and unavailable-data paths. A plugin stays unpublished until it passes validation and an installed-from-cache check.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for pull request expectations and [CLAUDE.md](../CLAUDE.md) for product requirements.

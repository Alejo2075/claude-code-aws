# Architecture

This repository provides modular Claude Code plugins for developing and operating serverless applications on AWS. The plugins cover the application lifecycle from architecture and implementation through testing, deployment, and operations.

The supported infrastructure sources are AWS CDK with TypeScript and CloudFormation. Other frameworks may be detected, but are not currently supported for infrastructure analysis.

## Repository structure

Plugin source folders are grouped by capability:

```text
plugins/
  core-experience/       # AWS context, interface, guardrails, resource exploration
  design/                # architecture, CDK infrastructure, diagrams, prototypes, reviews
  development/            # service plugins, nested by service area
  quality-operations/     # security, tests, deployment, cost, observability
packages/                 # shared TypeScript libraries used at build time
templates/plugin/         # plugin scaffold
tests/                    # shared fixtures, integration and packaging tests
docs/                     # architecture, development, security, release
```

The [README catalog](../README.md#plugins) links to every plugin and its source folder. The repository currently has 28 plugins; only `aws-context` and `aws-ui` are published in the marketplace.

## Plugin model

Each plugin has its own `.claude-plugin/plugin.json` manifest and may contain skills, agents, hooks, a mod, MCP configuration, and executable code. These components are siblings within a plugin. A skill provides an on-demand workflow; it does not automatically start an agent or hook.

Plugins are independently installable. Shared packages are development-time dependencies only: required code is bundled into each plugin so it can run from Claude Code's plugin cache without monorepo paths.

## Distribution

The main branch keeps categorized source folders. The release workflow creates a separate, generated `release` branch with each plugin flattened to `plugins/<name>`. Marketplace entries point to immutable version tags in that release tree. This keeps existing marketplace paths stable when source folders are reorganized.

The marketplace at `.claude-plugin/marketplace.json` is a catalog. It does not execute plugins. Installing a plugin copies it into Claude Code's local plugin cache.

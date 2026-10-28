<p align="center">
  <img src="assets/readme-logo.png" alt="Claude Code for AWS" width="900">
</p>

<p align="center">
  <a href="https://github.com/Alejo2075/claude-code-aws/actions/workflows/ci.yml"><img src="https://github.com/Alejo2075/claude-code-aws/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Alejo2075/claude-code-aws/actions/workflows/codeql.yml"><img src="https://github.com/Alejo2075/claude-code-aws/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-orange.svg" alt="Contributions welcome"></a>
</p>

<p align="center">Modular, open-source Claude Code extensions for the AWS development lifecycle.</p>

> **Project status:** the repository foundation, plugin template, test harnesses, cross-platform CI, and release pipeline are in place. **No plugin has been released yet.** The marketplace catalog is intentionally empty until a plugin passes validation and an installed-from-cache test.

## What this project is building

The goal is a marketplace of **independently installable plugins** that help you understand an AWS project, verify the active account and region, review infrastructure changes, investigate failures, and prepare safe deployments. Each capability should provide a tested workflow and useful evidence without requiring the rest of the ecosystem.

The extensions use supported Claude Code interfaces and your existing AWS credentials and tools. There is no hosted control plane, mandatory account, or telemetry service. Cloud-changing workflows require explicit authorization; local hooks complement AWS IAM and organization controls rather than replacing them. See the [security model](docs/security-model.md).

## Roadmap

| Stage                 | Deliverable                                                   | Status   |
| --------------------- | ------------------------------------------------------------- | -------- |
| Repository foundation | Plugin template, validation, tests, CI, release process       | Complete |
| Verified context      | Project detection and STS-verified AWS identity               | Planned  |
| Operation guard       | Tested local policy decisions for covered operations          | Planned  |
| Infrastructure review | CDK change classification and evidence-based preflight        | Planned  |
| Wider lifecycle       | Focused security, cost, observability, and delivery workflows | Future   |

The [roadmap](docs/ROADMAP.md) defines milestones and acceptance criteria. The [first-plugin guide](docs/choosing-first-plugins.md) lays out candidates and trade-offs; final plugin content and names have not been selected.

## Install plugins

Once the first plugin is released, add the marketplace in Claude Code and install only the capability you need:

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install <plugin>@claude-code-aws
```

The supported baseline is Claude Code 2.1.295 or later, Git, and Node.js 22 or later. AWS-aware workflows will use your existing AWS profiles, SSO sessions, or assumed roles. See the [installation guide](docs/install.md) for setup, updates, removal, and troubleshooting.

## Develop locally

The repository is a pnpm and TypeScript workspace. Node.js 22 or later and pnpm 10.34.8 are required.

```sh
corepack enable
pnpm install
pnpm verify
pnpm new:plugin <name> "<one-line description>"
```

`pnpm verify` runs the local checks used by CI, including formatting, linting, types, tests, marketplace validation, packaging, and release-flow checks. The template is a development tool; generated plugins are not automatically published. See [plugin authoring](docs/plugin-authoring.md) and the [release runbook](docs/release.md).

## Contribute

Contributions are welcome, including bug reports, reproducible AWS edge cases, tests, documentation, and focused plugin proposals. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [issue templates](.github/ISSUE_TEMPLATE). Keep credentials, account-specific infrastructure, and private logs out of issues and fixtures. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

The project is licensed under [MIT](LICENSE). [CLAUDE.md](CLAUDE.md) is the product and engineering source of truth; the [development plan](docs/DEVELOPMENT_PLAN.md) records foundation work and implementation status.

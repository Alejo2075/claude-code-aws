# Claude Code for AWS

![Project logo](./Pixelated%20Terracotta%20Typography_%20Claude%20Code%20for%20AWS.png)

An open-source project building modular Claude Code extensions for AWS development.

**Status:** the platform foundation is complete. The plugin template, test harnesses, CI on macOS, Linux, and Windows, and the release pipeline all work. **No plugin has been released yet.** The marketplace catalog stays empty until the first plugin passes its tests and the installed-from-cache check.

## Goal

Support the AWS development lifecycle through independently installable plugins: verified context, infrastructure review, safe delivery, diagnosis, security, and cost analysis. The project uses official Claude Code extension points and the user's own AWS credentials. It does not host a cloud control plane or replace AWS tools.

## Install (once plugins are released)

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install <plugin>@claude-code-aws
```

Requires Claude Code 2.1.295 or later, git, and Node.js 22 or later. See [docs/install.md](docs/install.md).

## Principles

- Local-first, modular, and read-only by default.
- Verify AWS account and principal with STS before cloud-affecting operations.
- Require explicit authorization for cloud mutations, and treat IAM and AWS-side controls as the enforcement boundary ([security model](docs/security-model.md)).
- Distinguish measured facts, estimates, inferences, and unknowns.
- Make each plugin work independently from its installed location.

## Develop

```sh
pnpm install
pnpm verify                     # everything CI runs, locally
pnpm new:plugin <name> "<one-line description>"
```

| Document                                                         | Purpose                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| [CLAUDE.md](CLAUDE.md)                                           | Product and engineering requirements                   |
| [docs/ROADMAP.md](docs/ROADMAP.md)                               | Product milestones                                     |
| [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)             | Foundation plan and implementation status              |
| [docs/choosing-first-plugins.md](docs/choosing-first-plugins.md) | Candidates and recommended order for the first plugins |
| [docs/plugin-authoring.md](docs/plugin-authoring.md)             | Conventions, testing, and verified platform behavior   |
| [docs/release.md](docs/release.md)                               | Release runbook                                        |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [SECURITY.md](SECURITY.md) for vulnerability reporting. The project is licensed under [MIT](LICENSE).

# Claude Code for AWS

![Project logo](./Pixelated%20Terracotta%20Typography_%20Claude%20Code%20for%20AWS.png)

An open-source project to build modular Claude Code extensions for AWS development. The repository is currently in its planning stage; there is no installable plugin yet.

## Goal

Support the AWS development lifecycle through independently installable plugins: verified context, infrastructure review, safe delivery, diagnosis, security, and cost analysis. The project uses official Claude Code extension points and the user's own AWS credentials. It does not host a cloud control plane or replace AWS tools.

## Current status

The implementation plan and release criteria are in [docs/ROADMAP.md](docs/ROADMAP.md). [CLAUDE.md](CLAUDE.md) contains product and engineering requirements. Features and documentation will be added as working slices; an empty plugin catalog would imply capabilities that do not exist.

## Principles

- Local-first, modular, and read-only by default.
- Verify AWS account and principal with STS before cloud-affecting operations.
- Require explicit authorization for cloud mutations; treat IAM and AWS-side controls as the enforcement boundary.
- Distinguish measured facts, estimates, inferences, and unknowns.
- Make each plugin work independently from its installed location.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [SECURITY.md](SECURITY.md) for vulnerability reporting. The project is licensed under [MIT](LICENSE).

## References

- [Claude Code plugin development](https://code.claude.com/docs/en/plugins/create)
- [Claude Code marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)

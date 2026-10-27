# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/Alejo2075/claude-code-aws/security/advisories/new). Do not disclose exploit details in a public issue, discussion, or pull request.

Include the affected plugin and version (or commit), reproduction steps, impact, and any safe proof of concept. Do not include live credentials, account IDs, or private AWS data. Maintainers will acknowledge and triage reports, coordinate a fix, and publish an advisory when appropriate. No fixed response SLA is promised at this stage.

## Supported versions

Only the latest released version of each plugin receives fixes. Updates reach users when they run `/plugin marketplace update claude-code-aws` or when auto-update is enabled for the marketplace.

## Security model

Plugins run locally with the user's existing AWS credentials and permissions. They keep telemetry off and document the limits of their local policy hooks. AWS IAM, SCPs, and permission boundaries remain the enforcement controls for cloud actions. See [docs/security-model.md](docs/security-model.md).

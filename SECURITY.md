# Security policy

Please report suspected vulnerabilities privately through the hosting provider's security advisory feature once the repository is published. If that is unavailable, ask a maintainer for a private reporting channel without disclosing exploit details in a public issue.

Include affected version or commit, reproduction steps, impact, and any safe proof of concept. Do not include live credentials or private AWS data. Maintainers will acknowledge and triage reports, coordinate a fix, and publish an advisory when appropriate. No fixed response SLA is promised at this stage.

The project has no installable release yet. Future plugins will use existing user credentials, keep telemetry off by default, and document the limits of local policy hooks. AWS IAM, SCPs, and permission boundaries remain the enforcement controls for cloud actions.

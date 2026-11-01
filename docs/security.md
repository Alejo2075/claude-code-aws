# Security model

Plugins run locally with the user's AWS credentials and permissions. They do not require a project-operated backend or send telemetry by default.

## Identity and credentials

- Use the AWS SDK credential provider chain or an explicitly selected profile or role.
- Verify the actual account and principal with STS before cloud-affecting workflows.
- Never print, persist, or transmit access keys, secret keys, session tokens, or credential files.
- If identity or target account cannot be verified, stop before a cloud mutation.
- Treat production as a user-configured policy classification; do not infer it only from names.

## Operations

Inspection, planning, and review are read-only by default. Cloud creation, update, deletion, replacement, and rollback are distinct risk levels. Destructive changes, stateful resources, broad IAM grants, public access, and production targets require clear explanation and explicit authorization.

Local guard hooks cover only the Claude Code operations they can observe. They can be bypassed by other commands, tools, processes, or direct AWS calls. Use IAM policies, permission boundaries, SCPs, and role separation as the enforcement boundary.

Never delete AWS resources, overwrite production data, rotate credentials, or execute rollback automatically. Do not treat missing telemetry or incomplete queries as proof that a resource or event does not exist.

## Evidence and sensitive data

Label findings as verified, locally declared, estimated, inferred, or unknown. Redact credentials, personal data, and sensitive log fields from output and stored reports. Do not put real credentials, account identifiers, ARNs, private logs, or customer infrastructure in fixtures or public issues.

For vulnerability reports, use the private process in the repository's [security policy](../SECURITY.md).

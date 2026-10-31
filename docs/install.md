# Install and manage plugins

## Available plugins

| Plugin                                              | What it does                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`aws-context`](../plugins/aws-context/README.md)   | Verifies the active AWS account, principal, region, and environment with STS and stores a snapshot. Read-only.                                                           |
| [`aws-ui`](../plugins/aws-ui/README.md)             | Shows the user, region, and environment in the prompt footer, with an opt-in status line. Never calls AWS. Works best with `aws-context`.                                |
| [`aws-guard`](../plugins/aws-guard/README.md)       | Asks for approval before AWS-changing commands, especially in production or when the account is not verified. Never calls AWS. A guardrail, not an enforcement boundary. |
| [`aws-explorer`](../plugins/aws-explorer/README.md) | Browses CloudFormation and CDK stacks, their resources and events, and resource properties in one account and region. Read-only, with secrets redacted.                  |

Install only what you need; none requires another. `aws-guard` and `aws-ui` are stronger with `aws-context`.

## Prerequisites

| Requirement                                           | Why                                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code **2.1.295** or later (`claude --version`) | Oldest version tested by CI                                                                                                                                                         |
| **git** on `PATH`                                     | Claude Code clones the marketplace and plugins with git                                                                                                                             |
| **Node.js 22** or later on `PATH` (`node --version`)  | Plugin hooks and tools are bundled JavaScript                                                                                                                                       |
| AWS credentials (only for AWS-aware workflows)        | Plugins use your existing AWS CLI and SDK configuration: profiles, IAM Identity Center (SSO), assumed roles, or environment variables. They never ask for, store, or print secrets. |

No account registration, hosted service, or telemetry is involved.

## Add the marketplace and install a plugin

In a Claude Code session:

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install <plugin>@claude-code-aws
```

Or from a shell:

```sh
claude plugin marketplace add Alejo2075/claude-code-aws
claude plugin install <plugin>@claude-code-aws
```

`/plugin` lists every available plugin with its description. Install only the plugins you need, because each one works on its own.

If you have no SSH key for GitHub, set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` in your environment. Otherwise installs and updates inside a session may fail.

To share the marketplace with everyone working in one repository, run `claude plugin marketplace add Alejo2075/claude-code-aws --scope project` there and commit the `.claude/settings.json` it writes.

## Update

Auto-update is **off** by default for third-party marketplaces. Choose one:

- **Turn on auto-update:** `/plugin` → **Marketplaces** → `claude-code-aws` → **Enable auto-update**.
- **Update manually:** run `/plugin marketplace update claude-code-aws`, or `claude plugin update <plugin>@claude-code-aws` from a shell.

Release notes for each version are on the repository's [Releases page](https://github.com/Alejo2075/claude-code-aws/releases).

## Pin, disable, uninstall

- **Stay on the generated release branch catalog:** `claude plugin marketplace add Alejo2075/claude-code-aws#release`
- **Disable temporarily:** `claude plugin disable <plugin>@claude-code-aws`. Re-enable it with `enable`.
- **Uninstall:** `claude plugin uninstall <plugin>@claude-code-aws`. This deletes the plugin's local data directory. Add `--keep-data` to keep it.
- **Remove everything:** `claude plugin marketplace remove claude-code-aws`. This uninstalls all of its plugins.

Disabling or uninstalling a plugin never affects other plugins or normal Claude Code use.

## Status line

Plugins cannot set Claude Code's main status line. Plugins that offer an AWS context indicator document a `statusLine` snippet to add to your own `~/.claude/settings.json`, and they also provide a text command.

## Troubleshooting

| Symptom                                                                      | Fix                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Executable not found in $PATH: "node"` in `/plugin` errors or the debug log | Install Node.js 22+ and make sure the environment that launches Claude Code has it on `PATH`. Policy hooks block guarded operations when Node is missing (they fail closed); other hooks are skipped. |
| `Plugin "<x>" not found in marketplace`                                      | Run `/plugin marketplace update claude-code-aws`, then check the exact name in `/plugin`                                                                                                              |
| Clone or update fails without prompting                                      | Set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`, or load a GitHub SSH key into `ssh-agent`                                                                                                                    |
| A plugin does not seem to load                                               | Run `claude plugin list` and `claude plugin details <plugin>@claude-code-aws`, and check the `/plugin` **Errors** tab                                                                                 |

Report bugs with the issue template. Report vulnerabilities privately, as described in [SECURITY.md](../SECURITY.md).

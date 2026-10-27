# __PLUGIN_NAME__

__PLUGIN_DESCRIPTION__

TEMPLATE-TODO: complete every section before the first release. CI refuses to release a plugin that still contains template markers.

## What it does

The user workflow this plugin improves, and the outcome the user gets.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install __PLUGIN_NAME__@claude-code-aws
```

## Prerequisites

- Claude Code 2.1.295 or later.
- Node.js 22 or later on `PATH`, used to run the plugin's hooks.
- TEMPLATE-TODO: any AWS tools and credentials, and how they are discovered. Never list secrets.

## Components

| Component | Name          | Side effects | Invocation          |
| --------- | ------------- | ------------ | ------------------- |
| Skill     | TEMPLATE-TODO | read         | automatic or manual |

## AWS permissions

The minimal IAM actions each workflow needs, with an example least-privilege policy. AWS IAM, SCPs, and permission boundaries remain the enforcement boundary. A hook in this plugin cannot intercept every possible AWS mutation.

## Data and privacy

What the plugin reads, what it stores in `${CLAUDE_PLUGIN_DATA}`, and its retention and redaction behavior. It sends no telemetry.

## Limitations

Known gaps, unsupported platforms, and conditions where results are incomplete.

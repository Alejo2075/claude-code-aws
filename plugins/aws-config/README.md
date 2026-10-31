# aws-config

Validate AppConfig feature flag documents and JSON configuration against a schema, plan a gradual rollout from a deployment strategy, and inspect AppConfig and Parameter Store resources in synthesized CDK output. Nothing is deployed and no flag or parameter is changed.

## What it does

- **`flags`**: validates an `AWS.AppConfig.FeatureFlags` document against the published schema: name pattern, up to 25 attributes, constraint types (string with pattern or enum, number range, array, boolean), values that satisfy their constraints, required attributes, values without a flag, flags without a value.
- **`validate`**: checks free-form configuration against a JSON Schema subset (type, required, properties, `additionalProperties: false`, enum, ranges, lengths, pattern, items).
- **`rollout-plan`**: the timeline of a linear or exponential rollout with a bake time (linear matches the documentation's example).
- **`inspect`**: AppConfig applications, environments, profiles, strategies, and Parameter Store parameters in `cdk.out` with findings: environments with no alarm monitors, all-at-once strategies, no bake time, profiles with no validator, parameters that look like secrets. Parameter values are never shown.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-config@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-config:flags flags.json
/aws-config:rollout-plan --type linear --growth 20 --minutes 60 --bake 15
/aws-config:inspect cdk.out
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                                     | Side effects                    | Invocation          |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------- |
| Skills    | `/aws-config:inspect`, `/aws-config:flags`, `/aws-config:validate`, `/aws-config:rollout-plan`, `/aws-config:parameters` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                           | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                                  | Status                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `flags`: AppConfig feature flag schema checks                                               | implemented + tested (schema read from the AppConfig type reference on 2026-10-31)                     |
| `validate`: JSON Schema subset                                                              | implemented + tested (a subset, stated)                                                                |
| `rollout-plan`: linear matches the documented example; exponential spacing is an assumption | implemented + tested                                                                                   |
| `inspect`: 5 rule ids over AppConfig and Parameter Store                                    | implemented + tested                                                                                   |
| Deploying configuration, changing flags, reading live values                                | not implemented by design                                                                              |
| Live inspection through the AWS SDK                                                         | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- Local schema validation is a subset of what AppConfig validators accept.
- The exponential rollout spacing is an assumption of this tool, stated in its output.
- Templates do not show the values currently deployed.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-config`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-config@claude-code-aws`: Claude Code is otherwise unchanged.

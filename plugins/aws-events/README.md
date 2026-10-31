# aws-events

Inspect EventBridge buses, rules, targets, and Scheduler schedules in synthesized CDK output; try an event pattern against a sample event; check schedule expressions and their next run times across time zones. It publishes no events and changes nothing.

## What it does

- **`inspect`**: buses, rules, and schedules in `cdk.out`, with findings: targets without a dead-letter queue, retries turned off, patterns that match a whole source, cron schedules without a time zone, a bus policy open to any principal, rules with no trigger.
- **`test`**: runs your event pattern against a sample event locally (exact, prefix, suffix, anything-but, numeric, exists, cidr, wildcard, equals-ignore-case, `$or`) and says which field missed.
- **`schedule`**: validates `at()`, `rate()`, and `cron()` (six fields) and lists the next runs in an IANA time zone, flagging local times that do not exist or occur twice on daylight saving days.
- **`envelope`**: a versioned event envelope and the rules behind it.
- **`graph`**: the bus, rule, and target graph as `ArchitectureGraph` JSON for `aws-diagrams`.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-events@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-events:routes cdk.out
/aws-events:test pattern.json event.json
/aws-events:schedule cron(0 12 * * ? *) --tz America/New_York
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                                          | Side effects                    | Invocation          |
| --------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-events:routes`, `/aws-events:design`, `/aws-events:schedule`, `/aws-events:inspect`, `/aws-events:test` | None; new files only on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                                                                | As above; `--json` for output   | Run by the skills   |

No agent, hook, or MCP server. Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                   | Status                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `inspect` rules (8 rule ids) over declared resources         | implemented + tested                                                                                                                       |
| `test`: pattern matcher (10 operators) against sample events | implemented + tested (operators from the EventBridge documentation; edge cases such as arrays of objects not verified against the service) |
| `schedule`: at, rate, cron with time zones and DST notes     | implemented + tested (hand-checked New York cases); service behavior in DST gaps unverified                                                |
| `envelope`, `graph`                                          | implemented + tested                                                                                                                       |
| cron `W`, `#`, and offset `L` syntax                         | not yet implemented (reported as unsupported, never guessed)                                                                               |
| Live inspection through the AWS SDK                          | not yet implemented (first release is local-first: no real account was available to verify an adapter)                                     |

## Limitations

- The local matcher approximates EventBridge; use the service's TestEventPattern for the final answer.
- Templates show declared rules, not what is deployed. Event buses created by other stacks or by hand are invisible.
- Daylight saving behavior of the real service for non-existent or repeated times is not verified here.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-events`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-events@claude-code-aws`: Claude Code is otherwise unchanged.

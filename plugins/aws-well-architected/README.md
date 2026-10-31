# aws-well-architected

Review a serverless workload across the **six Well-Architected pillars**, with the Serverless Applications Lens in mind, and turn the result into a prioritized improvement backlog. The review keeps four things apart that are easy to blur: **verified evidence** (read from the account by a specialist plugin), **automated inferences** (from code and templates), **self-reported answers** (a person said so), and **missing evidence**. Missing is never reported as met. There is **no score** and **no certification**: this is not an official AWS review.

## What it does

- **`review`**: runs 30 questions (13 answered from the synthesized CDK app, the rest from the team's answers), merges reports from `aws-security`, `aws-observability`, and `aws-infrastructure`, and shows per-pillar **counts**, gaps, disagreeing evidence, stale evidence, and missing evidence.
- **`assess`** (scope and answers): a scope file (criticality, environment, data classification, evidence window, owner) and an answers file for what code cannot show.
- **`evidence`**: which specialist command or team answer would fill each gap.
- **`improve`**: a Markdown plan, by priority, with risk, action, rough effort, owner, and how to verify.
- **`compare`**: resolved, regressed, and still-open questions between two reviews.

Priority comes from each question's authored impact, raised one level for security and reliability on high or mission-critical workloads. Impact and effort are the author's estimates, not measurements.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-well-architected@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-well-architected:assess  orders service, high criticality
/aws-well-architected:review  cdk.out --scope docs/reviews/scope.json --answers docs/reviews/answers.json
/aws-well-architected:improve docs/reviews/well-architected-review.json
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.** Evidence from the account arrives only as report files you pass in.

## Components

| Component | Name                                                                       | Side effects                               | Invocation          |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------ | ------------------- |
| Skills    | `/aws-well-architected:review`, `assess`, `evidence`, `improve`, `compare` | New files under `docs/reviews`, on request | Automatic or manual |
| Agent     | `well-architected-reviewer`                                                | Read-only                                  | Delegated           |
| Command   | `dist/cli.mjs`                                                             | As above; `--json` for output              | Run by the skills   |

No hook, no MCP server.

## Capability matrix

| Capability                                                                   | Status                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Six pillars, 30 questions (13 evaluated from templates), evidence strengths  | implemented + tested                                                                 |
| Specialist report merge (`aws-security`, `aws-observability`) by rule id     | implemented + tested (hand-built reports; real plugin output not exercised together) |
| Backlog, improvement plan, compare, stale and conflicting evidence           | implemented + tested                                                                 |
| `well-architected-reviewer` agent and two evals                              | implemented + unverified (evals not run)                                             |
| Questions are paraphrases of the pillar guidance, not the official WAFR text | by design; the official framework has many more questions                            |
| Reading evidence from the account itself; AWS Well-Architected Tool records  | not yet implemented                                                                  |

## Limitations

- Templates show what is defined, not what is deployed.
- A specialist report with no finding for a question is not evidence that it is met.
- Impact, effort, and priority are authored estimates.
- Not an AWS-endorsed review; no certification.

## AWS permissions

None. This plugin makes no AWS calls.

## Data and privacy

Reads files inside the project (paths outside are refused); notes and statements are redacted for secrets and personal data. Writes only new files. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-well-architected`.
2. `/aws-well-architected:review` on a `cdk.out`; confirm one `evidenced` answer by reading the template.
3. `/plugin disable aws-well-architected@claude-code-aws`: Claude Code is otherwise unchanged.

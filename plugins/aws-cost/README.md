# aws-cost

Estimate and compare the monthly cost of serverless workloads from **stated inputs and dated AWS list prices**. Every figure is labeled **estimated**, dated, and listed with what it leaves out. It makes no AWS calls and cannot change anything.

## What it does

- **`estimate`**: a monthly estimate for Lambda (requests and GB-seconds, x86 or Graviton, retries), API Gateway (HTTP or REST), DynamoDB on-demand, SQS standard, SNS, Step Functions Standard, and CloudWatch Logs, with tiered prices walked the way the price list defines them, the assumptions behind each line, the exclusions, and an optional **sensitivity** table (the same prices at 0.5x to 10x volume).
- **`compare`**: Lambda memory sizes from durations you measured at each size, x86 against Graviton, HTTP API against REST API. Each comparison names what the number does not cover (latency, features, compatibility, timeouts).
- **`prices`**: the snapshot's region and date.

It does not read billing data, invoice amounts, or forecasts from AWS (planned for 0.2, see below), change capacity or retention, or estimate services outside the list above.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-cost@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-cost:estimate  10M requests a month, 200 ms at 512 MB, HTTP API, DynamoDB 20M reads and 10M writes
/aws-cost:compare   lambda-memory --requests 1000000 --points 128:900,256:520,512:300
/aws-cost:compare   api-kind --requests 100000000
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, no credentials, no network.**

## Components

| Component | Name                            | Side effects              | Invocation          |
| --------- | ------------------------------- | ------------------------- | ------------------- |
| Skill     | `/aws-cost:estimate`, `compare` | None: pure calculation    | Automatic or manual |
| Command   | `dist/cli.mjs`                  | None; `--json` for output | Run by the skills   |

No hook, no agent, no MCP server.

## Three different numbers, never mixed

| Kind          | Meaning                                               | In this plugin                                                     |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| **estimated** | Computed from inputs you give and list prices         | everything here                                                    |
| **forecast**  | A scenario under stated assumptions about the future  | the sensitivity table is a scaling of the estimate, not a forecast |
| **actual**    | What AWS billed, with its data latency and exclusions | not available yet                                                  |

An estimate is never presented as the invoice. Inputs that are guesses should be labeled as such next to the number they affect.

## The price snapshot

`src/data/prices.us-east-1.json` is a **dated snapshot** of the public AWS Price List (`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json`), on-demand, US East (N. Virginia), retrieved 2026-10-31. Each price keeps its offer, usage type, publication date, and tiers. Prices change: the estimate states the latest publication date among the prices it used. Only us-east-1 is available; other regions differ. Credits, the free tier, savings plans, discounts, and tax are **not** applied. To refresh, re-extract the same usage types from the Price List API files (the file records each one).

## AWS permissions

None. This plugin makes no AWS calls.

## Data and privacy

Reads the workload you give it (inline, or a file inside the project) and prints. Stores nothing. No telemetry.

## Capability matrix

| Capability                                                                     | Status                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `estimate` for seven services with tiers, assumptions, exclusions, sensitivity | implemented + tested (golden calculations checked by hand) |
| `compare`: Lambda memory, architecture, API type                               | implemented + tested                                       |
| Prices: us-east-1 snapshot from the public Price List                          | implemented + tested (dated snapshot)                      |
| `analyze` (Cost Explorer), `optimize`, `budgets`, the cost-analyst agent       | not yet implemented (0.2)                                  |
| Other regions, Step Functions Express, DynamoDB provisioned, S3, EventBridge   | not yet implemented                                        |
| Fetching live prices at run time                                               | not yet implemented                                        |

**Cost Explorer (planned):** AWS charges for each paginated Cost Explorer API request (the documentation puts it at $0.01 and warns specifically about agents). The 0.2 `analyze` takes an explicit query budget, shows it before running, and stops at it.

## Limitations

- An estimate is as good as its inputs. Duration depends on the memory setting and on the workload; measure it.
- Lambda's free tier and monthly allowances are not applied, so small workloads are overestimated.
- Only the services listed are priced; real bills include data transfer, NAT gateways, KMS, X-Ray, metrics, and more.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-cost`.
2. `/aws-cost:estimate` with numbers you know, and compare one line to the AWS pricing page for the same date.
3. `/plugin disable aws-cost@claude-code-aws`: Claude Code is otherwise unchanged.

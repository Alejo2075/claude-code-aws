# aws-ai

Plan and review Amazon Bedrock applications locally: inspect Bedrock resources in synthesized CDK output, estimate token cost from prices you supply, chunk documents for retrieval, scan prompts for sensitive data, review RAG settings and agent tool permissions, and scaffold an evaluation harness. No model is called, so nothing is billed.

## What it does

- **`inspect`**: Bedrock agents, knowledge bases, data sources, and guardrails in `cdk.out`, with findings: agents without guardrails or with thin instructions, knowledge bases with no embedding model, default chunking, roles that can invoke any model.
- **`availability`**: the read-only commands that show which models exist in a region. A model is never assumed to be enabled.
- **`budget`**: an estimate of token cost from prices **you** supply (this plugin embeds no prices), with what it leaves out.
- **`chunk`**: deterministic overlapping chunks (about 4 characters per token) that prefer paragraph and sentence boundaries.
- **`prompt-check`**: counts secrets and personal data in a prompt without repeating them.
- **`rag-review`**: chunk size, overlap, top-k, embedding and vector-store dimensions, citations, metadata filters, evaluation set size.
- **`agent-review`**: the tools an agent may call: effect, approval, scope, input validation.
- **`eval-scaffold`**: a dataset (quality, safety, no-answer cases) and a runner skeleton that calls no model until you implement it.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-ai@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-ai:build a support chatbot, us-east-1
/aws-ai:rag rag.json
/aws-ai:agent tools.json
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.**

## Components

| Component | Name                                                                                   | Side effects                    | Invocation          |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| Skills    | `/aws-ai:build`, `/aws-ai:rag`, `/aws-ai:agent`, `/aws-ai:evaluate`, `/aws-ai:inspect` | None; new files only on request | Automatic or manual |
| Agent     | `bedrock-engineer`                                                                     | Read-only                       | Delegated           |
| Command   | `dist/cli.mjs`                                                                         | As above; `--json` for output   | Run by the skills   |

Every result says whether it comes from code or templates (declared), a fixture, a simulation, or an estimate.

## Capability matrix

| Capability                                                                             | Status                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inspect`: 6 rule ids over declared Bedrock resources and model permissions            | implemented + tested                                                                                   |
| `budget`: estimate from user-supplied prices (hand-checked)                            | implemented + tested                                                                                   |
| `chunk`, `prompt-check`, `rag-review`, `agent-review`, `eval-scaffold`, `availability` | implemented + tested                                                                                   |
| `bedrock-engineer` agent and evals                                                     | implemented + unverified (evals not run)                                                               |
| Invoking models, reading quotas or model access, AgentCore runtime inspection          | not implemented by design / not yet implemented                                                        |
| Live inspection through the AWS SDK                                                    | not yet implemented (first release is local-first: no real account was available to verify an adapter) |

## Limitations

- No prices, model names, or quotas are embedded: they change. The user supplies prices; availability is checked with the read commands.
- Token counts are approximate; the model's tokenizer decides.
- Pattern-based sensitive data detection misses names and free-text personal details.

## AWS permissions

None. This plugin makes no AWS calls.

## Expected AWS charges

None: it runs locally and creates nothing in AWS.

## Data and privacy

Reads files inside the project (paths outside it are refused). Writes only new files, never overwriting. Secret-like values are redacted from output. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-ai`.
2. Run the quick start commands on a `cdk.out` and compare one result with the template.
3. `/plugin disable aws-ai@claude-code-aws`: Claude Code is otherwise unchanged.

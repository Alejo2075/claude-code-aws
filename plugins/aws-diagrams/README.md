# aws-diagrams

Generate, validate, update, and export **architecture diagrams as editable Mermaid**, from synthesized CDK output, architecture plans, Step Functions definitions, or inventory files. Every node and arrow says how we know it: **intended** (a design), **declared** (in code), **deployed** (listed in an account), **observed** (seen in telemetry), or **inferred** (derived from permissions or configuration). It makes no AWS calls and writes only new files.

## What it does

- **`from-cdk`**: reads `cdk.out` (or a template), one box per stack. Links written in the template (event source mappings, dead-letter redrive, S3 notifications, SNS subscriptions, EventBridge targets, API routes, CloudFront origins) are solid; links implied by IAM or environment variables are dotted.
- **`generate`**: from an `ArchitecturePlan` (drawn as intended), an inventory (deployed; relations inferred unless marked observed), or a graph file. Views: architecture, dependency, data flow, trust boundaries (accounts and regions as boxes), event flow, deployment.
- **`from-asl`** (a CLI command): the state graph of a Step Functions definition with Choice, Catch, Default, Parallel, and Map.
- **`update` / `diff`**: add or remove nodes and edges without renaming the others; compare as-is and to-be with removed, added, and changed parts colored.
- **`validate`**: duplicate ids, edges to missing nodes, isolated nodes, cycles (an error only with `--acyclic`).
- **`export`**: `.mmd` source always; SVG/PNG when `@mermaid-js/mermaid-cli` is in the project or `mmdc` is on `PATH`.

Output is **stable**: node ids derive from their own names and everything is sorted, so adding a node does not rewrite the diagram. Secret-like and personal values in labels are redacted before drawing.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-diagrams@claude-code-aws
```

## Quick start (30 seconds)

```text
/aws-diagrams:from-cdk   cdk.out
/aws-diagrams:generate   plan.json --type event-flow
/aws-diagrams:export     docs/architecture/diagrams/orders.json --out docs/architecture/diagrams/orders --format svg
```

## Prerequisites

Claude Code 2.1.295 or later and Node.js 22 or later on `PATH`. **No AWS account, credentials, or network.** SVG/PNG needs the optional Mermaid CLI.

## Components

| Component | Name                                                                 | Side effects                            | Invocation          |
| --------- | -------------------------------------------------------------------- | --------------------------------------- | ------------------- |
| Skills    | `/aws-diagrams:generate`, `from-cdk`, `from-aws`, `update`, `export` | New files under the project, on request | Automatic or manual |
| Command   | `dist/cli.mjs`                                                       | As above; `--json` for output           | Run by the skills   |

No hook, no agent, no MCP server.

## Capability matrix

| Capability                                                         | Status                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `from-cdk` with declared and inferred links, stacks as boxes       | implemented + tested (real CDK fixtures)                                                |
| `generate` from plan, inventory, graph; seven view types           | implemented + tested                                                                    |
| State graph from an ASL definition                                 | implemented + tested                                                                    |
| `update`, `diff`, `validate`, stable ids, redaction                | implemented + tested                                                                    |
| `export` source; SVG/PNG through the Mermaid CLI                   | source: tested; images: implemented + unverified (fake renderer; real `mmdc` never run) |
| Live inventory (`from-aws` reads a file, it does not call AWS)     | file input implemented; live reads not yet implemented                                  |
| Rendering inside `aws-ui`                                          | not yet implemented (aws-ui panel milestone)                                            |
| Cross-stack `Fn::ImportValue` links, VPC and Cognito trigger edges | not yet implemented                                                                     |

## Limitations

- A template shows what is defined, not what is deployed or what runs. An inventory is only as complete as the file; a missing resource proves nothing.
- Dotted links show that something _can_ reach something, not that it does.
- Resource types outside the engine's list are not drawn.

## AWS permissions

None. This plugin makes no AWS calls.

## Data and privacy

Reads files inside the project (paths outside are refused). Writes only new files, never overwriting. No telemetry.

## Verify it by hand

1. `claude --plugin-dir plugins/aws-diagrams`.
2. `/aws-diagrams:from-cdk` on a `cdk.out`; check one dotted arrow against the stack's IAM policy.
3. `/plugin disable aws-diagrams@claude-code-aws`: Claude Code is otherwise unchanged.

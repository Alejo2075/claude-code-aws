---
name: plan
description: Turn requirements and a chosen design into an implementation plan other plugins can read: open questions, an ArchitecturePlan JSON document, ADR drafts, and the order of work. Use after the design is decided and before infrastructure is written.
argument-hint: "<title>"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs *)
---

# Implementation plan

## Side effects

`read` by default. `plan init` prints JSON; `adr --write` creates a new file under `docs/adr`. Nothing is overwritten.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs intake --requirements '<json>'` and settle the open questions that change the design.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs plan init --title "<title>" --requirements '<json>'`, save the JSON where the user wants it, and fill components, integrations, risks, and assumptions. Check it with `plan check <file>`.
3. Draft an ADR for each hard-to-reverse decision (`adr --title ... --decision ... --option ...`) and write it only when the user agrees.
4. Order the work by dependency, naming the owner plugin for each step: `/aws-diagrams` for the picture, `/aws-infrastructure` for CDK, the service plugins for the details, `/aws-testing` for tests, `/aws-deploy` for release, and `/aws-well-architected` for the review.

## Output

The plan document, the ADR drafts, the open questions, and the ordered work list.

## Failure and safety handling

- A plan is a recommendation under stated constraints, not a fact. Keep assumptions visible.
- Do not create infrastructure or deploy anything from this skill.

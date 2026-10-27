---
name: example
description: TEMPLATE-TODO one sentence stating what this skill does and the user phrases or situations that should trigger it.
---

# TEMPLATE-TODO skill title

TEMPLATE-TODO: rename this directory to the skill name, then fill every section. Keep sections that do not apply and say why.

## Side effects

One of: `read` | `local-write` | `cloud-mutate` | `cloud-destroy`. A review or diagnostic skill must be `read` and must not call mutating tools. Skills that can change cloud resources require manual invocation.

## Preconditions and inputs

- Required inputs, and how to obtain each one.
- Required local tools. Say what happens when one is missing.

## Read-only reconnaissance

What the skill inspects before deciding anything. It runs no mutations at this stage.

## Steps

1. Numbered steps, with decision points and the evidence each decision relies on.

## Agents and tools

Which agents or tools the skill uses, and why each one is needed.

## Output

The report format or schema. Separate verified facts, estimates, inferences, and unknowns.

## Failure, permission, cost, and safety handling

- Identity not verified: stop before any cloud-affecting step.
- Access denied or missing data: report the gap. Do not infer that a resource is absent.
- Never print credentials, tokens, or sensitive log fields.

---
name: refactor
description: Refactor CDK code (rename constructs, move resources between stacks, extract constructs) without replacing resources, by comparing the synthesized templates before and after for renamed logical ids and replacements. Use before any change that moves or renames infrastructure code.
argument-hint: "<baseline cdk.out> [candidate]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs diff *), Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs synth *)
---

# Safe refactoring

## Side effects

`read`. Synthesizing runs project code with a scrubbed environment and no AWS credentials. Nothing is deployed.

## Steps

1. Before changing code, synthesize and keep the result: `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs synth --out cdk.out.before` (or copy `cdk.out`).
2. Make the refactor, synthesize again, and run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs diff cdk.out.before cdk.out`.
3. Read the result: a logical id that disappears and another that appears with the same properties is a **rename**, which CloudFormation treats as delete and create. For stateful resources that means data loss unless the id is kept (`overrideLogicalId` in CDK) or a resource import or refactor operation is used.
4. Keep logical ids stable: renaming a construct changes its id; moving it to another parent changes its path. If the diff shows replacement of a table, bucket, or stream, stop and change the code until it shows none.

## Output

The diff, the renamed and replaced resources, and what to change so nothing stateful is replaced.

## Failure and safety handling

- The comparison is of templates, not a change set; the final word is a change set (`/aws-deploy:preflight`).
- Never delete the old resources by hand to "fix" a duplicate.

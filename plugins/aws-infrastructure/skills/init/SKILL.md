---
name: init
description: Start a CDK v2 TypeScript app the safe way: project layout, stack and construct boundaries, tags, removal policies, environments, and a first synth. Use when there is no CDK app yet.
argument-hint: "[app name]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs scaffold *), Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs synth *)
---

# Initialize a CDK app

## Side effects

`read` for guidance. `scaffold --write` creates new files; `synth` runs project code with a scrubbed environment and no AWS credentials. Nothing is deployed.

## Steps

1. Ask what the app does and which environments exist. If `/aws-architect` produced a plan, use its components.
2. Tell the user to run `npx cdk init app --language typescript` themselves (it installs dependencies from the network), or confirm it exists.
3. Propose the layout: one stack per lifecycle (stateful resources apart from stateless ones), stage-specific configuration in code, explicit `env` for account and region only when known, tags for owner and environment, and removal policies on stateful resources.
4. Use `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs scaffold <pattern> <Name>` for a starting construct, then `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs synth` and `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs inspect` to check what it produces.

## Output

The layout, the first constructs, and the synth result.

## Failure and safety handling

- Never run `cdk deploy` or bootstrap from this skill; that is `/aws-deploy`.
- Do not put account ids or secrets in code that will be committed.

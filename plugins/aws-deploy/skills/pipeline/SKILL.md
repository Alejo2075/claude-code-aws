---
name: pipeline
description: Generate a GitHub Actions deployment with OIDC (no access keys) and a least-privilege role that can only assume the CDK bootstrap roles. Use when the user wants CI/CD for CDK deployments.
argument-hint: "--account <id> --region <region> --repo <owner/name> --environment <name> [--write]"
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs pipeline *)
---

# Deployment pipeline

## Side effects

`read` without `--write` (it prints the files). With `--write`, `local-write`: it creates the workflow and two IAM policy documents, never overwriting. It creates nothing in AWS or GitHub.

## Preconditions and inputs

The account id, region, repository (`owner/name`), and a GitHub environment name. Ask the user for them; do not guess.

## Read-only reconnaissance

Check whether `.github/workflows/` already has a deploy workflow.

## Steps

1. Run without `--write` and show the workflow.
2. After the user agrees, run with `--write`.
3. Tell the user what remains for them to do: create the IAM OIDC provider and the role `github-cdk-deploy` from the two documents in `iam/`, and add required reviewers to the GitHub environment.

## Agents and tools

The Bash tool, restricted to this plugin's `pipeline` command. No agent and no MCP server.

## Output

The files, the next steps, and the design: the pull-request job runs without AWS credentials; the deploy job runs in a protected environment with `--require-approval broadening`.

## Failure, permission, cost, and safety handling

- Never put access keys in a workflow or in repository secrets for this.
- The trust policy is scoped to one repository and one environment: do not widen it.

---
name: auth
description: Show which API Gateway routes have an authorizer, how JWT authorizers are configured, and CORS, from the synthesized templates. Use when the user asks which endpoints are public, whether an API is authenticated, or to review API authorization.
argument-hint: "[path to cdk.out or a template]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs auth *)
---

# API authorization coverage

Builds a route-by-authorizer matrix for HTTP and REST APIs from the templates, with the JWT audience and issuer settings and the CORS origins.

## Side effects

`read`. Local template files only.

## Preconditions and inputs

- A `cdk.out` directory or template inside the project. AppSync and WebSocket APIs are not covered.

## Read-only reconnaissance

Do not read the CDK code to decide which routes are protected. Use the matrix.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs auth --json`.
2. List the routes with no authorization, and say which look sensitive and why that is only a name-based guess.
3. Report JWT authorizers that do not pin an audience or issuer, and CORS that allows every origin.

## Agents and tools

The Bash tool, restricted to this plugin's `auth` command. No agent and no MCP server.

## Output

The matrix first, then the findings. Always state the difference between **authentication** (the authorizer proves who the caller is) and **authorization** (whether this caller may touch this data, such as tenant isolation), and that the second is decided in the handler, which a template cannot show.

## Failure, permission, cost, and safety handling

- A public route may be intended (health checks, login). Ask before calling it a defect.
- Do not change an authorizer or a route from this skill.

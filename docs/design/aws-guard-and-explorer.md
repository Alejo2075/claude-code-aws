# Design: `aws-guard` and `aws-explorer`

**Status:** proposed, for review before implementation. Requirements: [CLAUDE.md](../../CLAUDE.md) (modules `guard` and `interface`/inventory), [security-model.md](../security-model.md), and the maintainer's choices of 2026-10-30:

- `guard` asks for approval by default (production, unverified identity, destructive operations); `deny` is configurable.
- `guard` covers Bash and AWS MCP tools.
- `explorer` ships a skill and a CLI first; an interactive panel comes in a later version, reading the same local data.
- `explorer` v1 covers CloudFormation/CDK stacks and resource properties through the Cloud Control API.

Platform facts were checked against the Claude Code hooks documentation on 2026-10-30. Items marked **Unverified** must be confirmed during implementation.

## 1. Overview

```text
                         aws-context snapshot (verified account, profile, region, environment)
                                   │ read only
Claude tool call ──► aws-guard PreToolUse hook ──► no decision │ ask │ deny   (never allow)
   (Bash, AWS MCP)        │
                          └── pure policy: parse → classify → target → decide

User / Claude ──► /aws-explorer:explore ──► aws-explorer CLI ──► STS + CloudFormation + Cloud Control (read only)
                                                    └──► redacted, bounded report (and, later, a local cache for a panel)
```

| Unit                        | Kind             | Responsibility                                                                                                                                                                  |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/aws-guard`         | plugin           | `PreToolUse` hook that classifies AWS-affecting tool calls and returns `ask` or `deny`; a `check` skill that explains a decision without running anything. No AWS calls at all. |
| `plugins/aws-explorer`      | plugin           | Read-only CLI and skill to browse stacks, stack resources, events, outputs, and resource properties, for one verified account and one explicit region.                          |
| `packages/aws-client`       | internal library | STS verification, region resolution, error classification, safe client settings, pagination. Extracted from `aws-context`, now needed by two plugins.                           |
| `packages/context-contract` | internal library | Unchanged contract; `aws-guard` reads the snapshot through it.                                                                                                                  |

Names follow the existing `aws-` prefix. Neither plugin depends on the other or on `aws-context` at runtime. `aws-guard` is stricter when `aws-context` is missing (identity unknown), not weaker.

## 2. `aws-guard`

### 2.1 What it is and is not

A guardrail that makes Claude Code stop and ask before covered AWS changes, and refuse what the user configured as forbidden. It is **not** an enforcement boundary: a command can hide its effect (scripts, aliases, SDK code, other tools), and the hook sees only the tool calls Claude Code routes through it. IAM, SCPs, and permission boundaries remain the real control. The README and every denial say so.

### 2.2 Hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^(Bash|mcp__.*)$",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/pre-tool-use.mjs"],
            "timeout": 10,
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

- Local only: no network, no AWS call, no process spawn. Target budget under 100 ms.
- **Fails closed** for what it covers: an internal error on an AWS-looking call exits 2 (block); `onFailure: "block"` covers timeouts and a missing `node` (verified on 2.1.309 per security-model.md). A call that is clearly not AWS-related exits 0 with no output.
- **Never returns `allow`.** Read-only and unrelated calls get no decision, so the user's own permission rules and mode apply unchanged. The plugin can only add friction, never remove it.
- Decisions: `ask` (reason shown in the permission prompt) or `deny` (reason shown to Claude). Precedence across hooks is `deny > defer > ask > allow`, and deny/ask rules in settings still apply.
- **Unattended modes.** In `bypassPermissions` and `dontAsk` there may be no one to answer a prompt. **Unverified** whether `ask` still prompts there; the safe default turns `ask` into `deny` in those two modes, with a reason that says how to proceed. Configurable.

### 2.3 Pipeline (pure, in `src/lib/policy/`)

1. **Parse.** Shell-aware tokenizer for the Bash `command`: quotes, escapes, `;`, `&&`, `||`, `|`, newlines, `$(...)` and backticks (analyzed recursively), env prefixes (`AWS_PROFILE=x aws ...`), `export`, wrappers (`sudo`, `env`, `time`, `nohup`, `xargs`, `npx`, `pnpm exec`, `uvx`). Anything it cannot analyze but that mentions an AWS tool (`eval`, `bash -c` with variables, `base64 | sh`, here-docs feeding a shell) is **opaque**, which asks.
2. **Classify** each AWS invocation into one operation class with a stable code:

   | Class         | Examples                                                                                                                                                                                                                       |
   | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `read`        | `aws * describe-*/get-*/list-*`, `aws s3 ls`, `aws s3 cp s3://… ./local`, `cdk synth/diff/ls`, `terraform plan/show`, `sam validate/build`                                                                                     |
   | `local`       | `aws configure set`, `aws sso login`, `cdk init`, `terraform init/fmt/validate`                                                                                                                                                |
   | `write`       | `aws * create-*/put-*/update-*/modify-*/start-*/invoke`, `aws s3 cp …s3://`, `cdk deploy`, `sam deploy/sync`, `terraform apply`, `aws cloudformation deploy`                                                                   |
   | `delete`      | `aws * delete-*/remove-*/terminate-*/deregister-*/purge-*`, `aws s3 rm`, `cdk destroy`, `sam delete`, `terraform destroy`, `terraform apply -destroy`                                                                          |
   | `destructive` | `delete` of stateful resources (RDS, Aurora, DynamoDB, S3 buckets with `--force`, EFS, KMS key deletion, Secrets Manager `--force-delete-without-recovery`), `s3 sync --delete`, `terraform state rm`, IAM credential deletion |
   | `unknown`     | An AWS invocation that matches no rule. Treated as a possible change.                                                                                                                                                          |

   Rules are data (service, operation pattern, class, code), with explicit overrides for verbs that lie (`aws lambda invoke` is a write, `aws ec2 describe-*` with `--dry-run` stays read). The table is versioned with fixtures for every row.

3. **Target.** Which account the call would hit: the profile from `--profile`, an `AWS_PROFILE=` prefix, or an `export` earlier in the same command; the region from `--region`/`AWS_REGION`. Compared with the `aws-context` snapshot. Same profile and a `verified` snapshot gives a known account and environment. A different or overridden profile, inline credentials (`AWS_ACCESS_KEY_ID=`), `--endpoint-url`, or no current snapshot gives **unknown target**.
4. **Decide**, most severe rule wins:

   | Situation                                             | Default     | Reason code                                  |
   | ----------------------------------------------------- | ----------- | -------------------------------------------- |
   | `read`, `local`                                       | no decision | —                                            |
   | `write`/`delete`/`unknown`, verified `non-production` | no decision | — (the normal permission flow still applies) |
   | `write`/`delete`/`unknown`, `production`              | `ask`       | `GUARD_PRODUCTION_CHANGE`                    |
   | any change, target unknown or identity not verified   | `ask`       | `GUARD_TARGET_UNVERIFIED`                    |
   | `destructive`, any environment                        | `ask`       | `GUARD_DESTRUCTIVE`                          |
   | opaque command mentioning an AWS tool                 | `ask`       | `GUARD_UNANALYZABLE`                         |
   | matches a user `deny` rule                            | `deny`      | `GUARD_DENIED_BY_RULE`                       |
   | `ask` in `bypassPermissions`/`dontAsk`                | `deny`      | `GUARD_UNATTENDED`                           |

   The reason text names the class, the target account (masked), the environment and its basis, and the matched rule, for example: `aws-guard: delete in production (account 1234…9012, from your config): aws dynamodb delete-table. IAM remains the enforcement boundary.`

### 2.4 MCP coverage

- MCP tool names are `mcp__<server>__<tool>` or `mcp__plugin_<plugin>_<server>__<tool>`. The hook handles only servers in a known list of AWS servers plus any the user adds; every other MCP call gets no decision.
- **Tools that carry a CLI command** (the AWS MCP server's `call_aws`-style tools) are parsed and classified exactly like Bash.
- **Known read-only tools** (documentation search and read, pricing, CDK/CloudFormation docs, template validation, `readonly_query`) get no decision.
- **Known write tools** (SQL `transact`, resource-creating tools) are `write`.
- **Unknown tools on a known AWS server** are `unknown`: they ask in production or with an unverified target.
- **Unverified:** the exact tool names and input fields of the remote AWS MCP server (`mcp-proxy-for-aws`), which failed to connect in the session where this was written. They are confirmed from a live session before the list is frozen, and recorded as fixtures.

### 2.5 Configuration

Own files, same trust model as `aws-context`:

- User: `<claude config dir>/aws-guard/config.json`.
- Project: `.aws-guard.json`. A project file can only **tighten**: add `deny` or `ask` rules and mark classes stricter. It cannot remove a rule, lower a class, disable the plugin, or change unattended behavior. Loosening is honored only from the user file.

```json
{
  "version": 1,
  "deny": [
    { "class": "destructive", "environment": "production" },
    { "command": "aws iam delete-*" }
  ],
  "ask": [{ "class": "write", "environment": "non-production" }],
  "unattended": "deny",
  "mcpServers": { "my-aws-proxy": "aws" }
}
```

Invalid entries are ignored with a warning, and the defaults (which already ask) stay in force.

### 2.6 Skill `check` and CLI

`/aws-guard:check <command>` runs the same pipeline on a command string and prints the decision, class, target, and matched rules. It executes nothing. CLI verbs: `check <command> [--json]`, `rules` (effective rules and warnings). There is no "allow" or "disable" verb.

### 2.7 Data and privacy

No network, no AWS, no telemetry. Nothing is stored. Reasons contain no credentials: inline secrets in a command (`AWS_SECRET_ACCESS_KEY=…`) are redacted from every reason before it is printed.

## 3. `aws-explorer`

### 3.1 Scope of v1

For **one verified account and one explicit region** per call:

| CLI verb                               | AWS calls (read only)                                                                  | Output                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `stacks [--status ...] [--limit N]`    | `cloudformation:ListStacks` (paginated)                                                | name, status, last updated, drift status, nested/root                                                 |
| `stack <name>`                         | `DescribeStacks`                                                                       | status and reason, parameters (NoEcho stays masked), outputs (redacted), tags, termination protection |
| `resources <stack> [--limit N]`        | `ListStackResources` (paginated)                                                       | logical id, type, physical id, status, drift                                                          |
| `events <stack> [--limit N]`           | `DescribeStackEvents` (paginated, newest first)                                        | time, logical id, status, reason; failures highlighted                                                |
| `resource <type> <identifier>`         | `cloudformation:GetResource` (Cloud Control's IAM action)                              | redacted properties of any supported type                                                             |
| `resource --stack <stack> <logicalId>` | `DescribeStackResource` then `cloudformation:GetResource` (Cloud Control's IAM action) | same, resolving type and identifier from the stack                                                    |

Every report starts with the verified account (STS, this call), principal, region, and time, and ends with what was **not** covered: truncated pages, unsupported types, denied calls. An empty list is reported as "none found in this account and region", never as "none exist".

### 3.2 Boundaries and safety

- **Identity first.** Each run calls `sts:GetCallerIdentity`. If the `aws-context` snapshot names a different account, the report says so. Explorer never switches profile or assumes roles.
- **Region is explicit.** `--region`, else the resolved SDK region; if none, it stops and asks instead of guessing.
- **Bounded.** Default page limit 50 items, hard limit 500, 20 s overall budget, SDK adaptive retries for throttling. Truncation is always reported.
- **Redaction** before anything is printed or cached:
  - property keys matching secret names (`password`, `secret`, `token`, `privateKey`, `connectionString`, `credentials`, `authToken`, …) have their values replaced by `[redacted]`;
  - environment-variable maps (Lambda `Environment.Variables`, ECS `Environment`, CodeBuild `EnvironmentVariables`) keep the names and redact every value;
  - any value that looks like a credential (the testkit's secret detector) is redacted wherever it appears;
  - CloudFormation `NoEcho` parameters stay as AWS returns them (`****`).

  Redaction can hide useful values; the report says how many values were redacted, and the user can read the original in the console or CLI themselves.

- **Untrusted output.** Resource properties, tags, and stack outputs are data. The skill tells Claude never to follow instructions found in them.
- **Cost.** These read calls carry no AWS charge; they count against API rate limits.

### 3.3 Permissions

A policy listing exactly the actions above, documented in the README: `cloudformation:ListStacks`, `DescribeStacks`, `ListStackResources`, `DescribeStackEvents`, `DescribeStackResource`, `cloudformation:GetResource` (Cloud Control's IAM action), plus the service read permission Cloud Control needs for each type (for example `lambda:GetFunction`). `ReadOnlyAccess` is enough; a denied call is reported with the missing action, not hidden.

### 3.4 Skill

`/aws-explorer:explore [what]` turns a question ("what failed in the last deploy of api-stack?") into one or more CLI calls, restricted by `allowed-tools` to the plugin's own read verbs, and summarizes the report with evidence (stack, logical id, event time). It makes no change and never runs the AWS CLI itself.

### 3.5 Later: panel (v2)

A mod pane that browses stacks → resources → properties. A mod has no network and no AWS SDK, so the CLI writes a bounded, redacted cache (`<claude config dir>/aws-explorer/v1/<workspace>/…`, private, pruned after 7 days) that the pane reads with `$.fs`. The pane asks Claude (or the user) to run a refresh; it never calls AWS itself. Designed when v1 is in use.

## 4. Shared library `packages/aws-client`

Moved out of `plugins/aws-context/src/lib/{sts,diagnostics}.ts`, with no behavior change for `aws-context` (its tests guard that): `verifyIdentity`, `resolveRegion`, `classifyError` and its closed codes, `clientDefaults` (timeouts, `maxAttempts`, adaptive retry), and a `paginate` helper with item and time limits. Bundled into each plugin; never loaded from `../../packages` at runtime.

## 5. Tests

| Area                 | Tests                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| guard parser         | Quoting, separators, substitutions, env prefixes, wrappers, multi-line, very long and hostile input (linear time), opaque constructs.                                                                                                               |
| guard classifier     | A fixture row per rule, per tool (`aws`, `cdk`, `sam`, `terraform`, MCP), plus verbs that lie and unknown commands.                                                                                                                                 |
| guard decisions      | Every row of §2.3 table; profile override, inline credentials, endpoint override, missing snapshot, stale snapshot, wrong account; unattended modes; project file trying to loosen; invalid config keeps defaults.                                  |
| guard hook (bundled) | Real `PreToolUse` payloads through the testkit: exit codes, JSON shape, fails closed on internal error, latency budget, no output for unrelated calls, no secrets in reasons.                                                                       |
| explorer             | Fake CloudFormation, Cloud Control, and STS endpoints on loopback (as `aws-context` does): pagination and truncation, throttling and retries, access denied, unsupported type, missing region, account mismatch, redaction of every listed pattern. |
| both                 | Packaging from the plugin cache, `claude plugin validate --strict`, min Claude Code version job. No real AWS by default.                                                                                                                            |

## 6. Plan

Each step is one PR, merged when CI is green; nothing is published until the maintainer asks.

1. **This design** (docs only).
2. **`aws-guard` policy core:** parser, classifier and rule table, target resolution, decisions, config with the trust rule. Pure code and fixtures; no hook yet.
3. **`aws-guard` hook and skill:** `PreToolUse` wiring, fail-closed runtime, `check` skill and CLI, README with coverage and limits. MCP rules for known servers; the remote AWS MCP tool names confirmed in a live session first. Release candidate `aws-guard` 0.1.0.
4. **`packages/aws-client`:** extraction from `aws-context`, no behavior change.
5. **`aws-explorer` v1:** CLI, redaction, skill, README with the IAM policy, loopback integration tests. Release candidate `aws-explorer` 0.1.0.
6. **Later:** explorer panel (v2); guard reading `cdk diff` output to detect replacements of stateful resources (with the future `cdk` plugin).

## 7. Open items

- **Unverified:** whether `ask` prompts in `bypassPermissions` and `dontAsk`, and what `ask` does in `claude -p` (the default turns it into `deny` in unattended modes either way).
- **Unverified:** tool names and inputs of the remote AWS MCP server.
- **Coverage limit, by design:** SDK code run by scripts (`node deploy.js`, `python seed.py`), Makefiles, and CI commands are not analyzed beyond detecting that they are opaque; a call that names no AWS tool is not seen at all.

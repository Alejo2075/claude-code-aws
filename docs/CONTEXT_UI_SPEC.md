# Implementation Specification — AWS Context & AWS UI

**Status:** Proposed implementation contract  
**Audience:** Claude Code implementing this repository  
**Scope:** The first two independent plugins in an AWS-oriented Claude Code marketplace  
**Language:** English for code, documentation, and plugin content

> Your task is to **implement** the two plugins described below in the existing repository, not merely provide a plan. Inspect the current repository first. Preserve existing user changes. Verify Claude Code's installed version and the official API docs before using any mod or plugin API. If a capability is unsupported, implement the documented fallback and report the limitation instead of inventing an API.

## 1. Product goal

Improve the everyday experience of developing with AWS in an otherwise clean Claude Code installation. First, establish a trustworthy, low-friction view of the active AWS identity. Second, expose that information through a compact, useful user interface.

These are **two independently installable plugins**:

1. **`aws-context`** — resolves and verifies AWS context, provides deterministic commands and a small cache/contract.
2. **`aws-ui`** — presents that context in Claude Code using supported UI extension surfaces and a status-line fallback.

Both belong to the same marketplace. **Do not** create a generic `aws-agents`, `aws-skills`, or `aws-mcp` plugin for this milestone. Neither plugin needs a subagent or MCP server in v0.1.

## 2. Non-goals

- No AWS infrastructure deployments, mutations, role creation, or account provisioning.
- No full AWS Console replacement, resource explorer, cost dashboard, or CDK diff viewer in the MVP.
- No persistent daemon, hosted API, telemetry, database, or user account system.
- No silent changes to `~/.aws/config`, `~/.aws/credentials`, shell startup files, or Claude Code's global settings.
- No storing access keys, session tokens, SSO tokens, or the full raw environment in cache/logs.
- Do not fork Claude Code, patch undocumented internals, or require the user to install every marketplace plugin.

## 3. Technical decisions

- **Runtime:** TypeScript on Node.js; use AWS SDK for JavaScript v3 and the standard credential provider chain for AWS identity resolution.
- **Claude Code:** official plugin manifests, hooks, skills, and mods where supported.
- **Distribution:** one marketplace, two plugin directories, independently installable and independently testable.
- **Shared contract:** versioned, validated JSON snapshot of AWS context. The UI must not reach into the context plugin's in-memory state.
- **Packaging:** each plugin's distributable directory must be self-contained. Bundle required runtime dependencies; never assume access to `../../packages` from Claude Code's plugin cache.
- **No cross-plugin hard dependency:** `aws-ui` must render a useful `Not configured` / `Unknown` state even when `aws-context` is not installed.
- **Safety:** inspection only. AWS mutations are out of scope.

## 4. Functional specification: `aws-context`

### 4.1 Capabilities

1. Discover local AWS configuration without changing it: selected profile name (if any), region, and credentials availability.
2. Resolve **effective** AWS identity with STS `GetCallerIdentity` (account ID and principal ARN) using the active credential chain.
3. Support IAM Identity Center/SSO, named profiles, environment credentials, temporary credentials, and multi-account configurations through standard AWS tooling.
4. Distinguish **configured profile** from **verified AWS account**. Never infer the actual account only from a profile name or environment label.
5. Classify environment as `production`, `non-production`, or `unknown` using **explicit local mapping**, not name-based assumptions. Unknown must remain unknown until configured.
6. Expose status, explicit refresh, and simple configuration inspection. Show clear errors for missing credentials, expired SSO session, access denial, unresolved region, and offline operation.
7. Provide a stable, versioned JSON context snapshot that other plugins can read without AWS API calls.

### 4.2 Resolution policy

- Honor the AWS SDK's credential resolution chain, with no custom credential parser and no fallback to another profile without user intent.
- Respect standard region resolution, including `AWS_REGION`, `AWS_DEFAULT_REGION`, and profile settings where applicable. If no region resolves, show `unknown` rather than silently choosing one.
- Resolve actual account identity with STS rather than treating `AWS_PROFILE` or `CDK_DEFAULT_ACCOUNT` as proof.
- When verification fails, explicitly separate **unverified local configuration** from last-known verified identity; never present old identity as current.
- Use a short bounded timeout, best-effort retry policy, and a reasonable cache TTL (proposed default: 5 minutes). No high-frequency polling.
- Handle changes in workspace and profile deliberately. Allow a manual refresh; do not assume changing a variable in an external terminal updates an already-running Claude Code process.

### 4.3 Commands and skill

Implement a deterministic Node CLI, such as:

```text
aws-context status [--json]
aws-context refresh [--json]
aws-context config show
```

Provide `skills/status/SKILL.md` as a thin user-facing Claude Code workflow (e.g. `/aws-context:status`) that invokes the trusted deterministic command and summarizes the result. Avoid asking Claude to infer account identity by reading arbitrary files.

In v0.1, **do not** implement a `switch` command that silently changes credentials or profiles. If asked to change profiles, explain the proper user-controlled configuration approach and re-verify afterwards.

### 4.4 Snapshot contract

Define and validate a schema equivalent to:

```ts
type AwsContextSnapshotV1 = {
  schemaVersion: 1;
  workspaceId: string; // hash, not a raw path
  profile: string | null; // configured selection, not proof
  region: string | null;
  accountId: string | null; // verified through STS
  principalArn: string | null; // do not expose session tokens
  environment: "production" | "non-production" | "unknown";
  verification: "verified" | "unverified" | "expired" | "error";
  verifiedAt: string | null; // ISO 8601
  staleAfter: string | null; // ISO 8601
  diagnosticCode: string | null; // sanitized and stable
};
```

- Store an atomic snapshot in a versioned OS-appropriate user cache location, scoped by workspace (hash the canonical project directory) and selected configuration.
- Avoid world-readable permissions where the OS supports restrictive file modes.
- Never cache secrets, arbitrary environment variables, or raw SDK errors that might contain sensitive values.
- Cache is not a security source of truth and must never be used alone to authorize AWS operations.
- Define a small library for read/write/schema validation with tests; UI may reuse the **schema**, not depend on the context process being active.

## 5. Functional specification: `aws-ui`

### 5.1 MVP: AWS Context Bar

Show compact, persistent context information without clutter:

```text
AWS  ·  account: 1234…9012  ·  us-east-1  ·  production  ·  verified
```

Rules:

- The primary information is **account, region, environment, and verification state**. Profile can appear when space allows.
- Mask the account ID by default; allow full details on an explicitly opened detail view or command.
- Represent `Unknown`, `Unverified`, `Expired`, `Offline`, and `Stale` unambiguously. Never show a stale account as verified/current.
- The UI must not run STS, scan all profiles, or perform network requests on every render.
- Long fields must truncate cleanly in narrow terminals. Support terminals without colors or icons.
- Do not replace existing dialogs, intercept prompts, or change tool permissions in the UI plugin.

### 5.2 Preferred UI surface

Implement `aws-ui` as a Claude Code **mod** using only documented APIs. Start with the least invasive supported surface (e.g. a prompt-adjacent band or compact panel); add an optional details view only if the current mod API supports it. Verify the installed CLI's capabilities and documented types before implementation.

The mod reads the validated snapshot via a safe reader or bundled runtime, updates when context changes, and degrades gracefully when no data is available.

### 5.3 Fallback: native status line

Supply a standalone status-line command/script that reads the same cached snapshot. **Do not install/activate it by overwriting** `~/.claude/settings.json` automatically. Provide a documented opt-in setup path, detect existing `statusLine` settings, and preserve user configuration. Claude Code has one configurable status-line command: integrate carefully rather than assuming ownership of that slot.

Avoid extra dependencies like `jq` if a Node-based implementation can read stdin and format output. The fallback must still work when UI mods cannot render (for example, headless workflows).

### 5.4 Future UI extensions — NOT v0.1 deliverables

Define interfaces or placeholder documentation, but do not implement these yet:

- Infrastructure diff viewer (reads structured reports from an infrastructure plugin).
- Deployment status/timeline (reads structured operation events).
- Logs/metrics inspector (reads observability data).
- Cost overview (reads timestamped billing data, not guessed prices).

Do not add panels with fake data or promise capabilities without an actual upstream data source.

## 6. Plugin boundaries and communication

```text
AWS SDK / STS
      │
      ▼
 aws-context (identity resolution, validation, snapshot)
      │
      ▼
 Versioned local JSON contract
      │
      ├──────────► aws-ui mod (interactive presentation)
      │
      └──────────► optional native status-line script
```

- `aws-context` must work completely without `aws-ui`.
- `aws-ui` must load and display an empty/unconfigured state without `aws-context`.
- The two plugins can be installed together or separately.
- Do not create a custom network service, socket, or MCP server just to communicate these small snapshots.

## 7. Recommended repository layout

```text
.claude-plugin/
  marketplace.json
plugins/
  aws-context/
    .claude-plugin/plugin.json
    skills/status/SKILL.md
    hooks/hooks.json                 # only if required
    dist/                            # bundled CLI/runtime
    README.md
  aws-ui/
    .claude-plugin/plugin.json
    hooks/hooks.json                 # mod module registration
    hooks/register.js                # compiled/bundled if needed
    dist/statusline.js               # opt-in fallback
    README.md
packages/
  context-contract/                 # schema + serialization tests
  context-runtime/                  # AWS resolution and cache
examples/
  context-fixtures/
tests/
  integration/
  smoke/
README.md
AGENTS.md
package.json
pnpm-workspace.yaml
```

The layout may be adjusted based on existing repository files. Keep manifests and component paths compliant with the installed Claude Code version. Avoid creating empty folders only to match this diagram.

## 8. Configuration

Use a small project or user config file with explicit semantics, for example:

```yaml
# Illustration of an application-owned config format, NOT an AWS/Claude native setting
version: 1
accounts:
  "123456789012":
    environment: production
  "210987654321":
    environment: non-production
ui:
  maskAccountId: true
  showProfile: true
```

- Do not equate profile names like `prod` with verified production identity.
- No automatic editing of AWS configuration or Claude Code global settings.
- Validate config values; warn about malformed or conflicting mappings.
- Avoid writing sensitive identifiers to logs or screenshots unless the user deliberately requests expanded details.

## 9. Behavior and test matrix

| Scenario                                           | Expected result                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| No AWS CLI, profile, or credentials configured     | UI loads and shows `Not configured`; command explains setup without crashing.        |
| Named profile with working credentials             | Shows selected profile and STS-verified account.                                     |
| AWS IAM Identity Center session valid              | Standard credential chain works; account verified.                                   |
| AWS IAM Identity Center session expired            | `Expired`/`Unverified` state; no silent login or profile switch.                     |
| Environment credentials override profile selection | Display effective verified account; do not equate it with profile's assumed account. |
| No region configured                               | Region `unknown`; error/help text is actionable.                                     |
| AWS temporarily unreachable                        | Show last-known snapshot only as stale; never claim it is current.                   |
| Switch to a different workspace                    | Different workspace-scoped snapshot; no cross-project leakage.                       |
| Corrupted or old snapshot schema                   | Ignore safely; show unknown and recommend refresh.                                   |
| `aws-ui` installed alone                           | No startup error; meaningful empty state.                                            |
| `aws-context` installed alone                      | CLI and skill function without any UI.                                               |
| Narrow terminal, no color                          | Readable, bounded one-line text.                                                     |
| User already has a custom status line              | Do not overwrite it; explain opt-in composition.                                     |
| Mod unsupported or rendering unavailable           | Document/test the native status-line fallback.                                       |

Tests must mock AWS STS and credential sources. CI must not need a real AWS account or billable cloud resources.

## 10. Security and performance requirements

- AWS verification only calls a read-only identity API.
- No credential material in stdout, stderr, error reports, snapshots, or telemetry.
- Fail closed on identity _claims_: uncertain data must be marked unverified, but Claude Code itself must continue working.
- Context refresh must be bounded in time; UI redraw must read local data only.
- No automatic role assumption or cross-account enumeration.
- No global hooks that block arbitrary commands in this milestone; `aws-guard` is a different future plugin.
- Reuse the application's session permissions and avoid elevated privileges.
- Add deterministic unit tests for serialization, TTLs, conflicting sources, formatting, truncation and bad input.

## 11. Implementation phases and deliverables

### Phase A — Inspect and scaffold

- Inspect existing repository, package manager, and relevant AGENTS.md/CLAUDE.md.
- Verify `claude --version` and review current plugin/mod documentation.
- Create/update marketplace entries and plugin manifests.
- Set up TypeScript build, lint, unit tests, and reproducible plugin packaging.

### Phase B — Context runtime

- Implement config discovery, STS verification, state resolution, sanitized diagnostics, local cache, `status`, and `refresh` commands.
- Add the status skill and unit/integration tests using mocks.
- Validate the plugin with `claude plugin validate`.

### Phase C — UI

- Implement a minimal, safe mod to render the context using documented APIs.
- Implement the native status-line fallback and opt-in setup instructions.
- Add compact and expanded state presentations where APIs allow.
- Validate and run both plugins together and individually.

### Phase D — Release readiness

- Add README for each plugin with prerequisites, examples, limitations, and uninstall steps.
- Add fixture-based CI and smoke checks.
- Verify install/update behavior from the local marketplace.
- Document anything unimplemented honestly; do not claim production readiness from passing mocked tests alone.

## 12. Acceptance criteria / definition of done

1. `aws-context` and `aws-ui` each pass `claude plugin validate`.
2. Marketplace validates and both plugins install individually from the local marketplace.
3. `aws-context` resolves a real AWS identity when valid credentials are explicitly available; otherwise it reports a safe, accurate degraded state.
4. `aws-ui` works with a fixture snapshot, with a live context snapshot, and with no context plugin installed.
5. No UI rendering code makes AWS network calls.
6. A working opt-in status-line fallback is documented and tested.
7. Existing AWS files, Claude settings, and other plugins remain unchanged unless explicitly authorized.
8. CI passes unit, mock integration and basic packaging tests without cloud access.
9. Plugin artifacts contain their runtime dependencies; none depend on monorepo-relative imports at runtime.
10. Final development summary lists files created, commands executed, passing tests, limitations and manual validation steps.

## 13. Recommended Claude Code execution prompt

After placing this file at the repository root, start Claude Code and say:

> Read `CONTEXT_UI_SPEC.md` and the repository's existing instructions. Implement Phases A–C, beginning with `aws-context`, then `aws-ui`. Inspect the installed Claude Code APIs before writing mods. Prefer the simplest documented solution, test with mocked AWS identities, validate both plugins and the marketplace, and do not modify global user configuration or AWS resources. Finish with actual tests, a summary of implemented behavior, and a list of any limitations.

## 14. Official references (verify again when implementing)

- Plugin overview: https://code.claude.com/docs/en/plugins
- Create a plugin: https://code.claude.com/docs/en/plugins/create
- Add plugin components: https://code.claude.com/docs/en/plugins/components
- Marketplace: https://code.claude.com/docs/en/plugin-marketplaces
- Mods overview: https://code.claude.com/docs/en/plugins/mods
- Create a mod: https://code.claude.com/docs/en/plugins/mods/create
- Native status line: https://code.claude.com/docs/en/statusline
- Hooks reference: https://code.claude.com/docs/en/hooks

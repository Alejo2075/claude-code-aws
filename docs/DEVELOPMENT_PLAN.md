# Development plan: platform foundation and release pipeline

This plan prepares the repository so that plugins can be developed, tested, released, installed, and used in Claude Code. It complements [ROADMAP.md](ROADMAP.md), which orders product milestones, and [CLAUDE.md](../CLAUDE.md), which defines requirements.

**Scope.** This plan builds the toolchain, conventions, test harnesses, CI, and distribution pipeline. It deliberately does **not** select, name, or implement any plugin. The first plugin is chosen afterwards and enters through the [plugin development loop](#7-plugin-development-loop).

**Status (2026-10-26): steps 1–8 are implemented and verified.** See [Implementation status](#10-implementation-status) for what was built, deviations from this plan, and the remaining manual steps. Next: choose the first plugins with [choosing-first-plugins.md](choosing-first-plugins.md).

## 1. Decisions

### Made

| Topic                  | Decision                                                                                                                                                            | Consequence                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Hosting                | Public GitHub repository under the maintainer's personal account (`Alejo2075`)                                                                                      | Users add the marketplace with `/plugin marketplace add Alejo2075/<repo>`                         |
| Built artifacts        | `main` holds sources only; CI builds and publishes installable plugins to a generated `release` branch                                                              | No `dist/` in `main`; install content is reproducible from CI                                     |
| Runtime                | Node.js ≥ 22 required on the user's machine (Node 20 reached end of life in April 2026); each executable is a single bundled JS file with no runtime `node_modules` | Hooks, CLIs, and MCP servers fail safely with a clear message when Node is missing                |
| Platforms              | macOS, Linux, and Windows supported and tested in CI from the start                                                                                                 | Exec-form hooks, no shell scripts in runtime paths, path handling tested on all three             |
| Versioning             | Independent semver per plugin, managed with Changesets; release tags follow `<plugin>--v<version>`                                                                  | Matches the tag convention Claude Code uses for dependency version ranges and `claude plugin tag` |
| Documentation language | English                                                                                                                                                             | Consistent with existing repository documents                                                     |
| Real AWS testing       | An isolated sandbox AWS account exists                                                                                                                              | A manual, approval-gated CI workflow with OIDC and a read-only role; never part of default CI     |

### Resolved during implementation

| Decision                              | Outcome                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository and marketplace name       | Repository `Alejo2075/claude-code-aws`, marketplace `claude-code-aws`. Both pass `claude plugin validate --strict`.                                                       |
| Minimum supported Claude Code version | **2.1.295**, the release that introduced hook `onFailure`, which fail-closed guards rely on. CI tests 2.1.295 and the pinned 2.1.309, and runs the latest release weekly. |
| Maintainer contact                    | Alejandro Santana, alejsant75@gmail.com, in `owner` and `author`                                                                                                          |
| Minimum Node.js                       | 22 (bundles target `node22`; CI runs Node 22 and 24)                                                                                                                      |
| First plugin and its scope            | Still open. See [choosing-first-plugins.md](choosing-first-plugins.md).                                                                                                   |

## 2. Verified platform constraints

These facts come from current Claude Code documentation, checked on 2026-10-26 against locally installed Claude Code 2.1.309. Re-verify them in the spike, because they drive the architecture.

| Constraint                                                                                                                                                                                                                             | Source                                                                                    | Design impact                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A marketplace is `.claude-plugin/marketplace.json` with required `name`, `owner`, and `plugins`.                                                                                                                                       | [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md) | One catalog at the repository root on `main`.                                                                                      |
| Plugin sources can be a relative path, `github`, `url`, `git-subdir`, `npm`, `archive`, or `command`. Git sources accept `ref` and `sha`.                                                                                              | Marketplace reference                                                                     | Catalog entries use `git-subdir` pointing at release tags (section 5).                                                             |
| Installed plugins are copied into a cache. `${CLAUDE_PLUGIN_ROOT}` changes on update. `${CLAUDE_PLUGIN_DATA}` persists across updates and is deleted on uninstall.                                                                     | [Manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md)       | No `../` paths. All state goes in `${CLAUDE_PLUGIN_DATA}`, never the plugin root.                                                  |
| A component path must start with `./` and stay inside the plugin root. Symlinks that point outside the marketplace are skipped.                                                                                                        | Manifest reference                                                                        | Shared code is bundled into each plugin at build time, never linked.                                                               |
| Users receive a new copy only when the computed `version` changes.                                                                                                                                                                     | [Host a marketplace](https://code.claude.com/docs/en/plugins/host-marketplace.md)         | Every release bumps `plugin.json` `version`. CI checks that the bump happened.                                                     |
| Background auto-update is off by default and is enabled by the user or an admin.                                                                                                                                                       | Host a marketplace                                                                        | The user docs explain `/plugin marketplace update` and how to enable auto-update.                                                  |
| `version` must not be set in both `plugin.json` and the marketplace entry.                                                                                                                                                             | Host a marketplace                                                                        | `version` lives only in `plugin.json`.                                                                                             |
| Hooks support exec form (`command` plus `args`). On Windows, the default shell is PowerShell when Git Bash is absent.                                                                                                                  | Manifest reference, [Hooks](https://code.claude.com/docs/en/hooks)                        | All hooks use `"command": "node"` with `args: ["${CLAUDE_PLUGIN_ROOT}/dist/<entry>.js"]`. No `.sh` files.                          |
| Files in `bin/` are put on `PATH`, but claude.ai organization sync rejects plugins with a top-level `bin/`.                                                                                                                            | Manifest reference, Host a marketplace                                                    | Default to `scripts/` or `dist/` referenced by `${CLAUDE_PLUGIN_ROOT}`. Use `bin/` only with a documented reason.                  |
| Plugin `settings` only applies `agent` and `subagentStatusLine`. A plugin cannot set the main session status line.                                                                                                                     | Manifest reference                                                                        | A context indicator needs a documented user `statusLine` snippet, a mod, or a text command. Never assume a plugin can install one. |
| `userConfig` options with `sensitive: true` are stored in the OS credential store.                                                                                                                                                     | Manifest reference                                                                        | Plugins never ask for AWS secrets. `userConfig` holds only non-secret choices such as a profile name or policy file path.          |
| `claude plugin validate [--strict] [--json]` returns exit 0, 1, or 2.                                                                                                                                                                  | [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference.md)                 | CI gate.                                                                                                                           |
| `claude plugin tag` creates `<name>--v<version>` after checking that versions agree.                                                                                                                                                   | CLI reference                                                                             | Used by the release job.                                                                                                           |
| `claude plugin eval` runs real model calls against a plugin, with graders, a no-plugin baseline, mocks, `--max-cost-usd`, and `--json`. CI needs `ANTHROPIC_API_KEY`. Shell tools run under an OS sandbox, which native Windows lacks. | [Plugin evals](https://code.claude.com/docs/en/plugin-evals.md)                           | Evals run on demand or nightly on Linux, with a cost ceiling. They are never a per-PR gate on Windows.                             |
| `claude plugin test` runs `*.test.ts` tests for mods.                                                                                                                                                                                  | CLI reference                                                                             | Used only if a mod is built (Phase 4).                                                                                             |
| `/plugin marketplace add owner/repo#ref` pins a ref. `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` helps users without a GitHub SSH key.                                                                                                         | Host a marketplace                                                                        | Documented in the install guide.                                                                                                   |

## 3. Repository layout

### 3.1 `main` (sources)

```text
.claude-plugin/
  marketplace.json          # public catalog; entries point at release tags
.changeset/                 # changesets config and pending changes
.github/
  workflows/                # ci.yml, release.yml, evals.yml, aws-sandbox.yml
  ISSUE_TEMPLATE/           # plugin proposal, bug, security-sensitive redirect
  pull_request_template.md
  CODEOWNERS
  dependabot.yml
docs/
  ROADMAP.md
  DEVELOPMENT_PLAN.md
  install.md                # end-user install, update, uninstall
  security-model.md         # hook coverage limits, IAM/SCP as enforcement boundary
  plugin-authoring.md       # conventions from section 6
  release.md                # maintainer release runbook
plugins/                    # one workspace package per plugin (empty until the first plugin)
packages/                   # shared libraries, created only when two plugins need them
templates/
  plugin/                   # scaffold copied by `pnpm new:plugin`
tests/
  packaging/                # installed-from-cache test harness (section 4.4)
  fixtures/                 # shared, sanitized AWS/CDK fixtures
scripts/                    # repository tooling (build-release, check-versions, new-plugin)
package.json                # private root; pnpm workspace scripts
pnpm-workspace.yaml
tsconfig.base.json
eslint.config.js
.prettierrc
.nvmrc
.gitattributes              # eol=lf for all text, so Windows checkouts stay consistent
```

No `plugins/<name>/` directory is created until that plugin has a working slice (CLAUDE.md: no empty placeholders). Until the first release, the marketplace catalog has an empty `plugins` array. The validator warns about that, so CI runs validation without `--strict` for that one condition until the first plugin exists.

### 3.2 Inside one plugin (convention for future plugins)

```text
plugins/<name>/
  .claude-plugin/plugin.json  # name, version, description, author, license, repository
  package.json                # private workspace package; "build", "test", "typecheck"
  src/                        # TypeScript sources (hooks, CLI, MCP server entry points)
  dist/                       # build output, gitignored on main, published on release
  skills/<skill>/SKILL.md
  agents/<agent>.md
  hooks/hooks.json            # exec-form, node + ${CLAUDE_PLUGIN_ROOT}/dist/...
  .mcp.json                   # only if the plugin ships an MCP server
  evals/                      # claude plugin eval cases (prompt.md / case.yaml + graders)
  test/                       # vitest unit and hook-contract tests
  README.md                   # purpose, prerequisites, permissions, side effects, limits
  CHANGELOG.md                # generated by changesets
```

### 3.3 `release` branch (generated, never edited by hand)

```text
.claude-plugin/marketplace.json   # same catalog, for users who add <repo>#release
plugins/<name>/
  .claude-plugin/plugin.json
  dist/                           # bundled JS only
  skills/ agents/ hooks/ .mcp.json
  README.md CHANGELOG.md LICENSE
```

Excluded from the release tree: `src/`, `test/`, `evals/`, `package.json` (to avoid a dependency install step in the cache), sourcemaps, and tsconfig files. Each release commit carries the tag `<name>--v<version>` for every plugin released in it.

## 4. Toolchain and test harnesses

### 4.1 Workspace

- pnpm workspaces. `packageManager: "pnpm@10.34.8"` (honored by Corepack and by `pnpm/action-setup`). The development Node version is pinned in `.nvmrc` to the active LTS (24). `engines.node: ">=22.12.0"` for tooling; plugin bundles need Node 22+.
- TypeScript in `strict` mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, `module: NodeNext`, and project references only if build time requires them.
- **esbuild** bundles each entry point into a single ESM `.mjs` file for `platform: node` and `target: node22`. Bundles have no external runtime dependencies. A license banner is included and `metafile` output is kept for size checks.
- **Vitest** for unit and contract tests. Coverage is reported, and thresholds are set per plugin once code exists.
- **ESLint** (typescript-eslint, strict type-checked) and **Prettier**.
- **Changesets** for per-plugin versions and changelogs.
- AWS SDK for JavaScript v3 modular clients (for example `@aws-sdk/client-sts`) are bundled into the plugins that use them. The bundled SDK uses the standard credential-provider chain, including SSO and assumed roles. The AWS CLI is optional and detected, never required by the toolchain.

### 4.2 Root scripts (contract for every plugin)

| Script                                               | Does                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                         | Bundles every plugin into `plugins/<name>/dist/`                                                                                    |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Static checks                                                                                                                       |
| `pnpm test`                                          | Unit and hook-contract tests for all packages                                                                                       |
| `pnpm validate`                                      | `claude plugin validate` on the catalog and each plugin (`--strict` once plugins exist)                                             |
| `pnpm check:versions`                                | `plugin.json` `version` equals `package.json` `version`; no `version` in catalog entries; catalog `ref` equals `<name>--v<version>` |
| `pnpm build:release`                                 | Assembles the release tree (section 3.3) in `out/release/` and validates it                                                         |
| `pnpm test:packaging`                                | Installs the release tree into an isolated Claude Code config and checks it (section 4.4)                                           |
| `pnpm new:plugin <name>`                             | Copies `templates/plugin/`, sets the names, and registers the workspace                                                             |

### 4.3 Hook contract test harness

A test utility runs a bundled hook exactly as Claude Code would. It spawns `node dist/<hook>.mjs`, writes the event JSON on stdin, sets `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` (a temporary directory), and `CLAUDE_PROJECT_DIR`, then asserts exit code, stdout JSON, and stderr. It also checks that no secret-shaped strings appear in any output. Event payload fixtures are taken from the hooks documentation for the Claude Code version under test and stored in `tests/fixtures/hooks/`. This is the foundation for testing any `PreToolUse` policy hook on all three operating systems.

### 4.4 Packaged-install test ("works from the plugin cache")

This test proves Definition of Done item 3 without network or credentials:

1. Run `pnpm build:release`, then turn `out/release/` into a local bare git repository with release tags.
2. Generate a temporary test catalog whose entries use `{ "source": "url", "url": "file://<bare-repo>", "ref": "<name>--v<version>" }`. This forces Claude Code to clone into its cache, as a real install does.
3. With an isolated `CLAUDE_CONFIG_DIR`, run `claude plugin marketplace add`, `claude plugin install … --json`, `claude plugin list --json`, `claude plugin details`, `disable`, `enable`, and `uninstall`.
4. Assert that the plugin is enabled, its components are inventoried, no load errors appear, and its hooks run from the cache path with the harness from 4.3. After uninstall, assert that `${CLAUDE_PLUGIN_DATA}` is removed and other plugins still load.

Spike items to confirm: `file://` acceptance for `url` sources, and whether CI needs an authenticated Claude Code for these commands (validation and install are expected not to need model access).

### 4.5 Behavior evaluations

- Each plugin keeps `evals/` cases created with `claude plugin eval init`. They cover correct skill triggering, grounding, refusal to mutate during review skills, and the no-plugin baseline.
- MCP calls and AWS responses are mocked with the eval mock and replay mechanism. Recordings are committed under `evals/mocks/.replay/`.
- They run in `evals.yml`, which is manual or nightly, on Linux. The models are pinned (`--model`, `--judge-model`), and the job uses `--max-cost-usd`, `--trust-plugin`, `--no-publish`, and `--json`. Results are archived. `ANTHROPIC_API_KEY` is stored as a repository secret in a protected environment.
- Free graders (`regex`, `tool_used`, `tool_order`, `file_exists`) are preferred for frequent runs. `llm` and `baseline` graders run only nightly.

### 4.6 Sandbox AWS integration tests

- `aws-sandbox.yml` runs only through `workflow_dispatch`, inside a GitHub environment that requires maintainer approval.
- It authenticates with GitHub OIDC, using `aws-actions/configure-aws-credentials` pinned by SHA, to an IAM role in the sandbox account. The role's trust policy is restricted to this repository and to that environment.
- The role starts as **read-only**, with `sts:GetCallerIdentity` plus the reads each plugin documents. Any future mutating test needs a separate role with a permissions boundary, a separate approval, and the resource tag `project=<repo>`, which scopes cleanup.
- The sandbox account ID and role ARN are stored as environment variables, never in the repository. No test runs against a contributor's personal account.

## 5. Distribution and release design

### 5.1 How users install

```text
/plugin marketplace add Alejo2075/<repo>
/plugin install <plugin>@<marketplace-name>
```

The catalog on `main` lists each plugin with a `git-subdir` source pinned to its release tag:

```json
{
  "name": "<plugin>",
  "description": "…",
  "source": {
    "source": "git-subdir",
    "url": "Alejo2075/<repo>",
    "path": "plugins/<plugin>",
    "ref": "<plugin>--v1.2.0"
  }
}
```

**Why `git-subdir` with tags instead of relative paths on `release`:**

- Users add the default branch with no `#ref` to remember.
- Each plugin is pinned independently, so releasing one plugin never moves another.
- The sparse checkout downloads only that plugin's subdirectory.
- The tags double as the `<plugin>--v<version>` convention that dependency version ranges resolve against.

The `release` branch also carries a catalog for users who prefer `Alejo2075/<repo>#release`.

Trade-off: for non-relative sources, Claude Code shows only the entry's own fields before install. Every catalog entry therefore carries `description`, `displayName` (optional), `keywords`, `license`, and `homepage`.

### 5.2 Release flow (Changesets)

1. A PR that changes a plugin includes a changeset (`pnpm changeset`). CI fails if a plugin's shipped files changed without one.
2. On `main`, the Changesets action opens or updates a **Version PR**. That PR bumps `package.json` and `plugin.json` (through a `version` script), updates `CHANGELOG.md`, and rewrites the catalog entry `ref` to `<plugin>--v<new>`. All of these are reviewed in one PR, so no bot pushes to protected `main`.
3. When the Version PR merges, `release.yml`:
   1. Runs the full CI gate.
   2. Runs `pnpm build:release` and `pnpm test:packaging` on the release tree.
   3. Commits the tree to the `release` branch. Only the release workflow's token can push there; the branch is protected against everyone else.
   4. Creates annotated tags `<plugin>--v<version>` on that commit, for the changed plugins only. It uses `claude plugin tag` from the release checkout so the version agreement check runs. Tags are signed where supported.
   5. Publishes a GitHub Release per plugin tag with its changelog section and a checksum of the plugin tree.
   6. Runs a **post-release smoke test**: install from the public catalog (`Alejo2075/<repo>`) in an isolated config, over HTTPS (`CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`).
4. A failed post-release smoke test opens an issue. Recovery is a new patch release, because tags are never moved or deleted after publication.

### 5.3 Renames, removals, and deprecation

- Use `displayName` for cosmetic changes. A `name` change requires an entry in the `renames` map, which is append-only.
- Removing a plugin uses `renames: { "<name>": null }`. `forceRemoveDeletedPlugins` is set only after an announced deprecation window.
- These rules are documented in `docs/release.md`.

## 6. Plugin authoring conventions

These go in `docs/plugin-authoring.md` and are enforced by the template, lint rules, and CI where possible:

1. **Self-contained:** a plugin never imports another plugin. Shared code moves to `packages/*` and is bundled in. Cross-plugin `dependencies` are declared only when one plugin's workflow requires another plugin to be enabled.
2. **Paths:** reference files only through `${CLAUDE_PLUGIN_ROOT}`, write state only to `${CLAUDE_PLUGIN_DATA}`, and read the project through `${CLAUDE_PROJECT_DIR}`. Never write to the plugin root.
3. **Hooks:** exec form only (`node` plus `args`). Each hook declares its event, matcher, timeout, documented coverage, and behavior on internal error. Hook coverage limits are documented, and a hook is never described as comprehensive enforcement.
4. **Node prerequisite:** every entry point starts by checking `process.versions.node`. When Node is missing or too old, the hook entry in `hooks.json` fails safely, and the README states the prerequisite.
5. **AWS access:** only through the SDK credential-provider chain. Never read credential files directly, and never print or persist keys or tokens. Region and account come from STS and SDK resolution, with provenance.
6. **Read/write labeling:** every skill, agent, MCP tool, and CLI command declares its side effects: `read`, `local-write`, `cloud-mutate`, or `cloud-destroy`. Review and diagnostic skills cannot invoke mutating tools.
7. **Output:** structured results come with evidence, confidence, and unknowns. Redaction runs before any display or persistence.
8. **Skills and agents** follow the required sections in CLAUDE.md (preconditions, reconnaissance, steps, tools, output schema, failure handling, manual-invocation flag). The template includes a skeleton for both.
9. **Telemetry:** none. Any future opt-in requires a design review.
10. **Cross-platform:** no shell scripts, no POSIX-only commands, and `path` APIs for all filesystem paths. Test fixtures include paths with spaces and Windows drive letters.

## 7. Plugin development loop

This is how each future plugin, starting with the first one, moves from idea to installed:

| Stage                 | Output                                                                                                                                                                   | Gate                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1. Proposal           | GitHub issue from the plugin proposal template: user workflow, outcome, AWS permissions, side effects, failure cases, why existing tools are insufficient                | Maintainer accepts                                      |
| 2. Contract           | `plugins/<name>/README.md` draft with inputs, outputs, side effects, permissions, limitations, and supported platforms                                                   | Reviewed in the first PR                                |
| 3. Scaffold           | `pnpm new:plugin <name>`                                                                                                                                                 | `pnpm validate` passes                                  |
| 4. Implement          | Deterministic logic in `src/`. Skills, agents, and hooks wired to it.                                                                                                    | Typecheck and lint                                      |
| 5. Test               | Unit tests, hook contract tests, negative tests (wrong account, wrong region, expired credentials, missing permissions, unavailable data, unsafe mutation), and fixtures | `pnpm test` on all three operating systems              |
| 6. Package            | Release tree and packaged-install test                                                                                                                                   | `pnpm test:packaging`                                   |
| 7. Evaluate           | `evals/` cases with baseline                                                                                                                                             | `evals.yml` passes the threshold under the cost ceiling |
| 8. Sandbox (optional) | Read-only sandbox run                                                                                                                                                    | `aws-sandbox.yml` with approval                         |
| 9. Release            | Changeset, then Version PR, then release                                                                                                                                 | Release workflow and post-release smoke test pass       |
| 10. Catalog           | The entry appears in `marketplace.json` through the Version PR                                                                                                           | Only after stages 1–9 pass (CLAUDE.md: no placeholders) |

### Definition of Ready (before stage 4)

- The proposal is accepted, and side effects and permissions are listed.
- Required Claude Code features are confirmed in the current docs and in the minimum supported version.
- Fixtures for the AWS and CDK responses involved are identified and sanitized.

### Definition of Done

Use the CLAUDE.md "Definition of done" list as the PR checklist, enforced through `pull_request_template.md`.

## 8. Implementation steps for this plan

These steps are ordered and map to commits. Each ends with its checks passing.

### Step 1 — Repository and governance

1. `git init` and an initial commit of the existing documents. Create the public GitHub repository; its name is the pending decision. Push.
2. Branch protection on `main`: required PR review, required CI checks, linear history, no force-push. Protect `release` so only the release workflow can push. Tag protection for `*--v*`.
3. Enable secret scanning, push protection, Dependabot alerts, and private vulnerability reporting. Update `SECURITY.md` to point to them.
4. Add issue templates (plugin proposal, bug), a PR template with the Definition of Done checklist, and `CODEOWNERS`.

Commit: `docs: establish OSS repository guidance and roadmap`.

### Step 2 — Spike: verify platform assumptions (time-boxed, throwaway)

1. In a scratch directory, build a minimal plugin with one skill, one exec-form `node` hook, and one `userConfig` field. Build a catalog with a relative path entry and a `file://` `url` entry.
2. On macOS, Linux (container or CI), and Windows (CI runner), confirm the following and record the results in `docs/plugin-authoring.md`:
   - validate output and exit codes
   - cache install and `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` resolution
   - exec-form hook execution and the stdin and stdout contract
   - Windows path forms
   - uninstall data removal
   - the behavior when `node` is absent from `PATH`
   - whether `claude plugin validate` and `install` run without authentication in CI
   - acceptance of the candidate marketplace and plugin names under `--strict`
3. Determine the minimum supported Claude Code version and how CI installs a pinned version.

Output: a short findings section in `docs/plugin-authoring.md`. No spike code is committed.

### Step 3 — Workspace and quality tooling

1. Root `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitattributes`, `tsconfig.base.json`, ESLint, Prettier, Vitest config, Changesets config, and an updated `.gitignore` (`out/`, `plugins/*/dist/`).
2. An empty-but-valid catalog `.claude-plugin/marketplace.json` with `name`, `owner`, `description`, and `plugins: []`.
3. Repository scripts: `check-versions`, `build-release`, `new-plugin`.

Commit: `chore: add pinned workspace and quality tooling`.

### Step 4 — Plugin template and harnesses

1. `templates/plugin/` with every file in section 3.2: a skill skeleton, an agent skeleton, an exec-form `hooks.json`, a Node version guard, an esbuild config, a sample test, an eval skeleton, and a README contract.
2. The hook contract harness (4.3) and the packaged-install harness (4.4), each with **self-tests that use a temporary plugin generated from the template during the test**. Nothing is committed under `plugins/`.
3. `docs/plugin-authoring.md` with the conventions from section 6.

Commit: `chore: add plugin template and test harnesses`.

### Step 5 — CI

`ci.yml` runs on every PR and push to `main`:

- **Matrix:** `ubuntu-latest`, `macos-latest`, and `windows-latest` × Node 22 and 24, plus a job on the minimum Claude Code version.
- **Steps:** install (frozen lockfile), format check, lint, typecheck, test, build, `check:versions`, `validate`, `build:release`, `test:packaging` (template self-test), and changeset presence check.
- **Security:** actions pinned by SHA, `permissions: contents: read` by default, CodeQL for TypeScript, gitleaks or the built-in secret scanning, `pnpm audit --prod` as a non-blocking report, and Dependabot for npm and Actions.
- **No secrets:** no AWS credentials and no Anthropic key in this workflow.

Commit: `ci: validate workspace, template, and packaging on all platforms`.

### Step 6 — Release pipeline

1. `release.yml` as described in section 5.2. It needs `contents: write` only in the release job and is restricted to `main`.
2. A dry-run mode (`workflow_dispatch` with `dry_run: true`) that builds the release tree, runs the packaging test, and prints the tags it would create, without pushing.
3. `docs/release.md` maintainer runbook: normal release, hotfix, failed smoke test, rename or removal, and key rotation for the eval secret.

Commit: `ci: add changesets release pipeline to release branch`.

### Step 7 — Evaluation and sandbox workflows

1. `evals.yml` (4.5), which discovers each plugin with `evals/` and skips cleanly when none exist.
2. `aws-sandbox.yml` (4.6), which is disabled until the OIDC role exists.
3. `docs/security-model.md`: trust boundaries, hook coverage limits, IAM/SCP/permissions boundaries as the real enforcement, the credential handling policy, and the redaction policy. Also add a setup guide for the sandbox OIDC role, with a least-privilege trust policy example.

Commit: `ci: add opt-in eval and sandbox AWS workflows`.

### Step 8 — User documentation and readiness review

1. `docs/install.md`:
   - prerequisites (Claude Code minimum version, Node ≥ 22, git, optional AWS CLI)
   - add marketplace, install, update (`/plugin marketplace update`, enabling auto-update), pin a version, disable, and uninstall
   - `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`
   - troubleshooting
   - the status-line limitation and a manual `statusLine` snippet pattern
2. README: link to install, authoring, and security docs. Keep the "no installable plugin yet" note until the first release.
3. **Readiness review:** run the full pipeline end to end with a template-generated throwaway plugin. That covers the Version PR, a dry-run release, and the packaging test. After the review, delete the throwaway plugin.

Commit: `docs: add installation, security model, and release runbook`.

**Exit criteria for this plan:**

- `pnpm new:plugin <name>` produces a plugin that passes typecheck, lint, test, validate, packaging, and the release dry-run on macOS, Linux, and Windows CI.
- A merged changeset for a real plugin would publish it to the `release` branch, tag it, and make it installable with `/plugin install <plugin>@<marketplace>`, without manual steps.

At that point the repository is ready for ROADMAP Milestone 1 through the [plugin development loop](#7-plugin-development-loop).

## 9. Risks and mitigations

| Risk                                                       | Mitigation                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code plugin contracts change                        | Pin a tested Claude Code version in CI. Add a scheduled job against the latest version. Spike findings are recorded with version numbers.        |
| Users without Node or with an old Node version             | Version guard in every entry point. Hooks fail safely; a policy hook fails toward `ask`, never silent allow. The README states the prerequisite. |
| Windows path and shell differences                         | Exec-form hooks, LF line endings, Windows in the CI matrix, and path fixtures with spaces and drive letters.                                     |
| Users stay on old versions (auto-update is off by default) | The install guide explains updates. Release notes highlight security fixes. Consider a skill that reports the installed version.                 |
| Release tag points at a broken tree                        | Packaging test before tagging, post-release smoke test, and immutable tags fixed forward by patch release.                                       |
| Eval cost or flakiness                                     | Opt-in workflow, cost ceiling, pinned models, free graders by default, mock replay, and evals that never block PRs.                              |
| Sandbox credentials misuse                                 | OIDC only, environment approval, read-only role, trust policy scoped to repository and environment, and no long-lived keys.                      |
| Name rejected by validator or reserved-name rules          | Validate candidate names in the spike before creating the repository.                                                                            |
| Bundled AWS SDK size and update lag                        | Modular clients, size budget from esbuild metafile, and Dependabot on SDK packages.                                                              |

## 10. Implementation status

| Step                           | State                            | Where                                                                                                                                                                                                                                                                                       |
| ------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Repository and governance   | Done                             | Public repository, rulesets (see [release.md](release.md#repository-protections)), secret scanning with push protection, Dependabot alerts and updates, private vulnerability reporting, issue and PR templates, CODEOWNERS                                                                 |
| 2. Spike                       | Done                             | Findings in [plugin-authoring.md](plugin-authoring.md#verified-platform-behavior), including real-session hook checks and missing-Node behavior                                                                                                                                             |
| 3. Workspace and tooling       | Done                             | `package.json`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`, `.changeset/`, `scripts/`                                                                                                                                                                                         |
| 4. Template and harnesses      | Done                             | `templates/plugin/`, `packages/testkit/`, `scripts/lib/{release,packaging,scaffold}.ts`, `scripts/selftest.ts`                                                                                                                                                                              |
| 5. CI                          | Done                             | `.github/workflows/ci.yml`, plus `codeql.yml`. Green on macOS, Linux, and Windows × Node 22 and 24, and on Claude Code 2.1.295.                                                                                                                                                             |
| 6. Release pipeline            | Done                             | `.github/workflows/release.yml`, `scripts/publish-release.ts`, `scripts/smoke-public.ts`                                                                                                                                                                                                    |
| 7. Evals and sandbox workflows | Done (inactive until configured) | `evals.yml` (`evals` environment, needs `ANTHROPIC_API_KEY`); `aws-sandbox.yml` (`aws-sandbox` environment with required reviewer; needs the OIDC role)                                                                                                                                     |
| 8. Docs and readiness review   | Done                             | [install.md](install.md), [security-model.md](security-model.md), [release.md](release.md). In the readiness review, a throwaway plugin went through changeset, `version-packages`, full `pnpm verify`, a local publish dry run, and a GitHub release dry run. Its branch was then deleted. |

### Deviations from the plan

- **Node 22 instead of 20.** Node 20 is end of life, and current tooling (Vitest 5, Changesets 3) requires Node 22.
- **Release branch push restriction.** Repository rulesets on personal accounts cannot exempt GitHub Actions. The `release` branch and the `*--v*` tags are therefore protected against force-push, deletion, and moving, but not against a direct push by the owner. [release.md](release.md#repository-protections) describes the deploy-key option that closes this gap.
- **Tags are not GPG-signed.** They are annotated tags created by `claude plugin tag` in CI and protected by ruleset.
- **`gitleaks` not added.** GitHub secret scanning with push protection is enabled instead.

### Remaining manual steps (owner)

1. Optional: add the `RELEASE_PR_TOKEN` secret so Version PRs trigger CI ([release.md](release.md#ci-on-the-version-pr)).
2. Before plugins have evals: add `ANTHROPIC_API_KEY` to the `evals` environment.
3. Before integration tests: create the sandbox OIDC role and set the `aws-sandbox` environment variables ([security-model.md](security-model.md#sandbox-account-for-integration-tests)).
4. Optional hardening: a deploy key as the only bypass actor for `release` and the tag rulesets.

### Not verified

- A non-dry-run release from a branch other than `main` is refused by the workflow guard. The guard was not exercised.
- Real-session hook behavior on Linux and Windows. CI covers installation and hook execution through the harness only.
- On GitHub itself: the first push to `release` with `GITHUB_TOKEN`, GitHub Release creation, and the public HTTPS smoke test. These run with the first real plugin release. The publish logic itself is verified end to end against a local git remote by `pnpm test:release-flow` (2 plugins, 2 releases, user install and update), on every PR and on all three operating systems.

# Plugin authoring guide

How to add a plugin to this repository, from scaffold to marketplace release. Read [CLAUDE.md](../CLAUDE.md) for product requirements and the [development plan](DEVELOPMENT_PLAN.md#7-plugin-development-loop) for the gated stages every plugin passes through.

## Quick start

```sh
pnpm install
pnpm new:plugin <name> "<one-line description>"
pnpm install                 # links the new workspace package
pnpm build && pnpm test && pnpm validate
```

The new plugin is at `plugins/<name>/` with version `0.0.0`. A `0.0.0` plugin is **unreleased**: it stays out of the catalog and the release tree, and it may contain `TEMPLATE-TODO` markers. A plugin is released when a changeset bumps it, normally to `0.1.0`. After that, CI refuses template markers and requires a changeset for every shipped change.

To try a plugin in a real session without installing it:

```sh
pnpm build
claude --plugin-dir plugins/<name>
```

Inside the session, `/reload-plugins` picks up rebuilt files.

## Layout

| Path                            | Ships to users  | Purpose                                                                                                              |
| ------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `.claude-plugin/plugin.json`    | yes             | Manifest. `name` must equal the directory and the `package.json` name. The version is managed by Changesets.         |
| `src/entries/*.ts`              | as `dist/*.mjs` | One bundle per entry point (hooks, CLIs, MCP servers), built by esbuild for `node22` with no runtime `node_modules`. |
| `src/lib/`                      | bundled         | Plugin logic. Keep it deterministic and unit-tested.                                                                 |
| `skills/<skill>/SKILL.md`       | yes             | Procedures. Use the section skeleton from the template.                                                              |
| `agents/<agent>.md`             | yes             | Specialist agents with constrained `tools`.                                                                          |
| `hooks/hooks.json`              | yes             | Exec-form hooks only (see below).                                                                                    |
| `.mcp.json`                     | yes             | Only if the plugin ships an MCP server.                                                                              |
| `README.md`                     | yes             | User contract: prerequisites, components, side effects, permissions, data, limitations.                              |
| `test/`                         | no              | Vitest unit and hook-contract tests. `test/integration/` is reserved for the approval-gated sandbox workflow.        |
| `evals/`                        | no              | `claude plugin eval` cases.                                                                                          |
| `package.json`, `tsconfig.json` | no              | Workspace build metadata.                                                                                            |

The release tree contains only the allowlist in [`scripts/lib/release.ts`](../scripts/lib/release.ts). Anything a plugin needs at runtime must live in an allowlisted path. Do not add a top-level `bin/`: claude.ai organization sync rejects plugins that have one. Use bundles under `dist/`, referenced through `${CLAUDE_PLUGIN_ROOT}`.

## Conventions

1. **Self-contained.** Never import another plugin. Code shared by two or more plugins moves to `packages/<name>` and is bundled into each plugin at build time. Declare `dependencies` in `plugin.json` only when one plugin's workflow really requires another plugin to be enabled.
2. **Paths.** Reference bundled files only through `${CLAUDE_PLUGIN_ROOT}`. Write state only to `${CLAUDE_PLUGIN_DATA}`, which survives updates and is deleted on uninstall. Read the project through `${CLAUDE_PROJECT_DIR}` or the hook input `cwd`. Never write to the plugin root, because it changes on every update.
3. **Hooks use exec form.** Use `"command": "node"` with `"args": ["${CLAUDE_PLUGIN_ROOT}/dist/<entry>.mjs"]`. There is no shell, so quoting and the PowerShell/bash differences disappear on Windows. Set an explicit `timeout`. The testkit refuses shell-form hooks.
4. **Fail closed for policy.** Any hook that guards an operation sets `"onFailure": "block"` and calls `runHook(handler, { failClosed: true })`. Advisory hooks such as context injection may fail open. See [verified behavior](#verified-platform-behavior).
5. **Node prerequisite.** `runHook` refuses Node < 22 before the handler runs. Document the prerequisite in the README.
6. **AWS access.** Use the AWS SDK for JavaScript v3 default credential-provider chain, so profiles, SSO, assumed roles, and environment credentials all work. Never read credential files directly, and never print or persist keys or tokens. Verify identity with STS `GetCallerIdentity` before anything cloud-affecting.
7. **Side-effect labels.** Every skill, agent, tool, and command declares one of `read`, `local-write`, `cloud-mutate`, or `cloud-destroy`. Review and diagnostic skills are `read` and must not invoke mutating tools.
8. **Output.** Report findings with evidence, confidence, and explicit unknowns. Redact before display or persistence. Hook stdout is a single JSON object or nothing.
9. **No telemetry.**
10. **Cross-platform.** No shell scripts in runtime paths. Use `node:path` for every filesystem path. Tests run on macOS, Linux, and Windows.

## Testing

| Layer         | Tool                                                          | Runs                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | Vitest, `plugins/<name>/test/**/*.test.ts`                    | Every PR, all OS × Node 22/24                                                                                                                                                                                                                                 |
| Hook contract | `@claude-code-aws/testkit` `runPluginHooks` / `runHookScript` | Every PR. Spawns the bundled hook from `hooks.json` with documented stdin and checks exit code, JSON, timeout, and secret-like output.                                                                                                                        |
| Packaging     | `pnpm build:release && pnpm test:packaging`                   | Every PR. Installs released plugins from a local git marketplace into an isolated `CLAUDE_CONFIG_DIR`, runs their hooks from the cache, then disables, enables, and uninstalls them.                                                                          |
| Pipeline      | `pnpm test:pipeline`                                          | Every PR. Proves the template still produces a releasable plugin.                                                                                                                                                                                             |
| Release flow  | `pnpm test:release-flow`                                      | Every PR. Publishes two plugins for real against a local bare git remote, then installs them as a user. A second release bumps only one of them: the test checks idempotency, unmoved tags, pinned content for the unbumped plugin, and the user update path. |
| Behavior      | `claude plugin eval` (`evals.yml`)                            | On demand and nightly. Uses real model calls with a cost ceiling.                                                                                                                                                                                             |
| AWS sandbox   | `aws-sandbox.yml`                                             | Manual, approval-gated, read-only OIDC role.                                                                                                                                                                                                                  |

Negative tests are mandatory for anything touching AWS: wrong account, wrong region, expired credentials, missing permissions, unavailable data, and attempted unsafe mutations. Use sanitized fixtures under `plugins/<name>/test/fixtures/` or `tests/fixtures/`. They must never contain real account IDs, ARNs, or credentials. `findSecretLikeStrings` from the testkit catches common credential shapes.

Example hook-contract test:

```ts
import { bashPreToolUseInput, runPluginHooks } from "@claude-code-aws/testkit";

const [result] = await runPluginHooks(bashPreToolUseInput(projectDir, "cdk deploy --all"), {
  pluginRoot,
});
expect(result?.json).toMatchObject({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask" },
});
expect(result?.secretFindings).toEqual([]);
```

## Releasing

1. When the plugin is ready to ship, run `pnpm changeset`, select it, and choose `minor` for the first release (`0.0.0` → `0.1.0`).
2. Merge the PR. The release workflow opens or updates the **Version PR**.
3. Merge the Version PR. The workflow publishes the `release` branch and the `<name>--v<version>` tag, creates a GitHub Release, and installs the plugin from the public marketplace as a smoke test.

Details and recovery procedures are in [release.md](release.md).

## Verified platform behavior

Verified on 2026-10-26 with Claude Code **2.1.309** on macOS. The packaging and pipeline checks also pass in CI on macOS, Linux, and Windows, and with Claude Code **2.1.295**, the minimum supported version.

| Behavior                                                                          | Result                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketplace name `claude-code-aws`                                                | Passes `claude plugin validate --strict`                                                                                                                                                 |
| Empty catalog                                                                     | One warning (`Marketplace has no plugins defined`), so `--strict` fails. `pnpm validate` tolerates only that warning.                                                                    |
| `plugin validate` on a plugin                                                     | Also prints advisory "plugin directory checks" (README, icon) that do not affect the result                                                                                              |
| `git-subdir` source with a `file://` URL and a tag `ref`                          | Installs into `<config>/plugins/cache/<marketplace>/<plugin>/<version>/`                                                                                                                 |
| `marketplace add`, `install`, `list`, `details`, `disable`, `enable`, `uninstall` | Work with an isolated `CLAUDE_CONFIG_DIR` and no Claude authentication. `--json` gives machine-readable results.                                                                         |
| Uninstall                                                                         | Deletes `${CLAUDE_PLUGIN_DATA}` (`<config>/plugins/data/<plugin>-<marketplace>/`)                                                                                                        |
| Exec-form hook in a real session                                                  | `${CLAUDE_PLUGIN_ROOT}` is substituted in `args`. `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, and `CLAUDE_PROJECT_DIR` are exported. SessionStart `additionalContext` reaches the model. |
| `node` missing from `PATH`                                                        | The hook fails to spawn (`Executable not found in $PATH: "node"`). This is a non-blocking error, so the session continues.                                                               |
| `node` missing with `"onFailure": "block"` on PreToolUse                          | The tool call is blocked                                                                                                                                                                 |
| Main session status line                                                          | A plugin cannot set it (`settings` only honors `agent` and `subagentStatusLine`). Context indicators need a user `statusLine` snippet, a mod, or a text command.                         |

Unverified so far: real-session behavior on Linux and Windows (CI verifies installation and hook execution only through the harness), and hook behavior in the desktop, IDE, and remote surfaces. Re-check this table when raising the tested Claude Code version.

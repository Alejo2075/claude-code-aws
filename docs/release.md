# Release runbook

How plugins get from `main` to users, and what to do when something goes wrong.

## Model

- `main` holds sources and the public catalog `.claude-plugin/marketplace.json`. Each catalog entry pins a plugin with a `git-subdir` source to its release tag:

  ```json
  {
    "source": {
      "source": "git-subdir",
      "url": "Alejo2075/claude-code-aws",
      "path": "plugins/<name>",
      "ref": "<name>--v<version>"
    }
  }
  ```

- `release` is a generated branch. It holds only installable files: manifests, `dist/` bundles, skills, agents, hooks, README, CHANGELOG, and LICENSE. It also carries its own catalog with relative sources, for users who add `Alejo2075/claude-code-aws#release`.
- Tags `<name>--v<version>` point at `release` commits. They are immutable: a ruleset blocks moving or deleting them.
- Users get a new copy only when a plugin's `version` changes, which happens when its catalog `ref` moves to a new tag.

## Normal release

1. Feature PRs include a changeset (`pnpm changeset`). CI fails a PR that changes a released plugin's shipped files without one.
2. On every push to `main`, the **Release** workflow runs Changesets. If changesets are pending, it opens or updates the **Version PR** (`chore: version plugins`). That PR:
   - bumps `package.json` and `plugin.json` versions (`pnpm version-packages`, which runs `scripts/sync-versions.ts`);
   - updates each plugin's `CHANGELOG.md`;
   - rewrites catalog entries to the new `<name>--v<version>` refs and adds entries for first releases.
3. Review the Version PR. Its CI must pass, including `check:template-markers` for newly released plugins. Then squash-merge it.
4. The push of the merged Version PR has no pending changesets, so the publish job:
   1. builds, tests, and validates, then assembles `out/release` and runs the packaging test;
   2. runs `scripts/publish-release.ts`, which commits the release tree to `release` and creates the missing tags with `claude plugin tag`. Plugins that are already tagged keep their exact tagged content;
   3. pushes `release` and the new tags, then creates one GitHub Release per tag with its changelog section;
   4. runs the smoke job, which installs each new release from the public marketplace over HTTPS in an isolated config.

The publish step is idempotent. It releases only catalog plugins whose tag does not exist yet, so re-running it is safe.

### Opening the Version PR

By default GitHub forbids Actions from creating pull requests. The repository setting **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests** is off here, so the Release workflow pushes the `changeset-release/main` branch and then fails with `GitHub Actions is not permitted to create or approve pull requests`. Either set `RELEASE_PR_TOKEN` (below, recommended: it also fixes CI on the Version PR) or open the PR from that branch yourself:

```sh
gh pr create --base main --head changeset-release/main --title "chore: version packages"
```

### CI on the Version PR

Pull requests opened with the default `GITHUB_TOKEN` do not trigger other workflows, so the Version PR's required checks never start. Use one of these options:

- **Recommended:** create a fine-grained personal access token scoped to this repository with **Contents: read and write** and **Pull requests: read and write**. Save it as the repository secret `RELEASE_PR_TOKEN`. The workflow uses it automatically.
- Or close and reopen the Version PR yourself, which triggers CI under your identity.
- As a last resort, the repository admin can bypass the required checks when merging. The `main` ruleset allows admin bypass only for pull request merges. Run `pnpm verify` locally on the PR branch before doing this.

## Dry run

`pnpm test:release-flow` runs the real publish logic against a local bare remote on every PR, so a regression in publishing fails CI before it can reach a release. The workflow dry run below also exercises GitHub-side configuration.

Actions → **Release** → _Run workflow_, with `dry_run` checked (the default). It builds and tests, then shows the release commit and the tags it would create, without pushing anything. Locally:

```sh
pnpm build && pnpm build:release && pnpm test:packaging
pnpm exec tsx scripts/publish-release.ts --dry-run
```

## Hotfix

There is no separate hotfix path. Fix on a branch, add a `patch` changeset, merge, then merge the Version PR. Never move or delete a published tag: users and dependency resolution rely on tags being immutable.

## Failed post-release smoke test

The workflow opens an issue titled "Post-release smoke test failed". The tag and release already exist.

1. Reproduce locally with `pnpm exec tsx scripts/smoke-public.ts <plugin>`.
2. Fix forward with a patch release.
3. If the release is harmful, also edit the GitHub Release notes to warn users. Consider temporarily pointing the catalog entry back to the previous tag in a PR. Users who already updated must update again after the fix.

## Rename or remove a plugin

- Use `displayName` for cosmetic changes. Changing `name` breaks every existing install.
- To rename, add the old name to the catalog's top-level `renames` map (`"old": "new"`). The map is append-only.
- To remove, delete the entry and add `"old": null` to `renames`. Set `forceRemoveDeletedPlugins: true` only after an announced deprecation window.
- Run `claude plugin validate . --strict` after editing `renames`.

## Secrets and settings used by workflows

| Name                                                                   | Kind                                | Used by         | Notes                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| `RELEASE_PR_TOKEN`                                                     | repository secret, optional         | release.yml     | Lets the Version PR trigger CI                                                   |
| `ANTHROPIC_API_KEY`                                                    | `evals` environment secret          | evals.yml       | Billed model calls; restrict the environment to `main`                           |
| `AWS_SANDBOX_ROLE_ARN`, `AWS_SANDBOX_REGION`, `AWS_SANDBOX_ACCOUNT_ID` | `aws-sandbox` environment variables | aws-sandbox.yml | See [security-model.md](security-model.md#sandbox-account-for-integration-tests) |

Rotate `RELEASE_PR_TOKEN` and `ANTHROPIC_API_KEY` at least yearly, and immediately if a workflow log or fork could have exposed them. Workflows never print them.

## Repository protections

| Ruleset         | Target         | Rules                                                                                                                                                                                                                    |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| main protection | default branch | PR required (squash only, conversations resolved), required checks: static, 6 test matrix jobs, minimum Claude Code version, CodeQL; linear history; no force-push or deletion. Admin may bypass only when merging a PR. |
| release branch  | `release`      | No force-push or deletion. Publishing only fast-forwards.                                                                                                                                                                |
| release tags    | `*--v*`        | Tags cannot be moved or deleted                                                                                                                                                                                          |

Personal-account repositories cannot restrict pushes on `release` to GitHub Actions alone. Only the owner has write access, so the remaining risk is a manual push by the owner. To close that gap, add a deploy key with write access as the only ruleset bypass actor and have the publish job push with it.

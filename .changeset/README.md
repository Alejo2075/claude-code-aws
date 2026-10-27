# Changesets

Every pull request that changes what a plugin ships needs a changeset. Run `pnpm changeset`, select the changed plugins, pick a semver bump, and describe the user-visible change.

On merge to `main`, the release workflow opens a Version PR. That PR bumps each plugin's `package.json` and `.claude-plugin/plugin.json`, updates its `CHANGELOG.md`, and points its marketplace entry at the next `<plugin>--v<version>` tag. See [docs/release.md](../docs/release.md).

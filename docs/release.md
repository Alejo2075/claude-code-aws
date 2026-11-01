# Releases

Plugins are versioned and released independently. The public marketplace is `.claude-plugin/marketplace.json`; it currently publishes `aws-context` and `aws-ui`.

## Release process

1. Make a focused change and add a changeset with `pnpm changeset` when an already released plugin's shipped files change.
2. Merge the change to `main`. The Release workflow opens or updates a version pull request from the changesets.
3. Review and merge the version pull request. It updates plugin and package versions, changelogs, and marketplace refs.
4. The Release workflow builds and validates the plugins, assembles the flat `release` branch, checks installation from the plugin cache, then creates immutable version tags and GitHub releases.
5. A smoke check installs new releases from the public marketplace. If it fails after publishing, fix forward with a patch release; do not move or delete an existing tag.

Run the full local checks before submitting a release change:

```sh
pnpm verify
```

To inspect the generated install tree without publishing:

```sh
pnpm build:release
pnpm test:packaging
pnpm exec tsx scripts/publish-release.ts --dry-run
```

Real publishing is performed by `.github/workflows/release.yml` from `main`. Do not manually edit the generated release branch or move published tags.

## Summary

<!-- What changes for users, and which issue or proposal this implements. -->

## Side effects

<!-- read | local-write | cloud-mutate | cloud-destroy. Explain any cloud-affecting path and its approval step. -->

## Definition of done

- [ ] Demonstrable improvement to an AWS development workflow, or tooling or documentation only
- [ ] `pnpm verify` passes locally (format, lint, typecheck, build, tests, validate, release tree, packaging, pipeline)
- [ ] Works when installed from the marketplace (packaging test covers this plugin), not only from source
- [ ] Least-privilege permissions documented; no secrets printed, persisted, or committed
- [ ] Error paths and partial or unavailable data handled safely, with negative tests
- [ ] Behavior and limitations documented in the plugin README
- [ ] Evals added or updated where Claude's behavior changes
- [ ] Disabling or uninstalling leaves other plugins and normal Claude Code working
- [ ] Changeset added for each changed released plugin (`pnpm changeset`)

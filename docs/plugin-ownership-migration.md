# Plugin ownership migration

Companion to [design-development-plan.md](design-development-plan.md). It records, per capability, what existed **before**, who owns it **after**, the files changed, how old commands keep working, the test evidence, and the known gaps. A capability that did not exist is marked **not present**; no migration is invented for it.

Every plugin referenced here is unreleased (`0.0.0` until the first Version PR is merged), so no user has installed the old commands. The shims below exist so that the repository, the tests, and any local `--plugin-dir` use keep working, and so that the first release does not ship two competing owners without a pointer.

## Audit (Phase 0)

Checked on `main` at commit `4dc5122`, by reading the code and not the file names.

| Capability the spec reassigns                           | Before                                                                                         | Present?                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Diagrams in `aws-architect`                             | `src/lib/diagram.ts` (Mermaid from a template), `diagram` skill and CLI command                | **Yes**                                                                     |
| Well-Architected review in `aws-architect`              | `src/lib/review.ts`: 11 template-answerable questions tagged by pillar, `review` skill and CLI | **Partly**: question set, no six-pillar report, evidence ledger, or backlog |
| Prototype / PoC orchestration in `aws-architect`        | none                                                                                           | **Not present**                                                             |
| Diagrams or exports in `aws-infrastructure`             | none (it has `inspect`, reference graph, `diff`, `review`, `scaffold`)                         | **Not present**                                                             |
| PoC workflow in `aws-infrastructure`                    | none                                                                                           | **Not present**                                                             |
| Diagram internals in `aws-ui`                           | none (footer labels and status line only)                                                      | **Not present**                                                             |
| Six-pillar coordinator in security, cost, observability | none                                                                                           | **Not present**                                                             |
| PoC runner in `aws-testing` or `aws-deploy`             | none                                                                                           | **Not present**                                                             |

## Diagrams: `aws-architect` to `aws-diagrams`

|                   |                                                                                                                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Before**        | `aws-architect` owned `architectureOf` / `toMermaid` (declared vs inferred links, 14 resource kinds).                                                                                                                                                                                                                      |
| **After**         | The engine lives in `packages/architecture-graph` (a typed graph with five bases, stable Mermaid, validation, diff, update, sources for templates, plans, inventories, and ASL). `aws-diagrams` owns every diagram command and the export. `aws-architect` keeps `diagram` as a **deprecated shim** over the same package. |
| **Files**         | Added `packages/architecture-graph/**`, `plugins/aws-diagrams/**`. Changed `plugins/aws-architect/src/lib/diagram.ts` (now an adapter), `src/lib/cli.ts` (deprecation note), `skills/diagram/SKILL.md` (marked deprecated), `package.json` (new dependency). Nothing deleted.                                              |
| **Compatibility** | `/aws-architect:diagram` and `diagram` CLI output keep their shape (`stacks[].architecture.{nodes,links}`) and add `deprecated`. Node ids in the Mermaid text changed from `n0` to name-derived ids: this is intentional (stable diffs) and is the one visible difference.                                                 |
| **Test evidence** | `plugins/aws-architect/test/architect.test.ts` (19, unchanged, passing on the adapter); `packages/architecture-graph/test` (15); `plugins/aws-diagrams/test` (15).                                                                                                                                                         |
| **Known gaps**    | The duplicate internals in `aws-architect` are an adapter only; the `diagram` command itself is removed in the next major version after `aws-diagrams` is released.                                                                                                                                                        |

## Well-Architected: `aws-architect` to `aws-well-architected`

|                   |                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Before**        | `aws-architect` `review`: 11 template-answerable questions tagged by pillar, no six-pillar report, no evidence ledger, no backlog.                                                                                                                                                                                                                 |
| **After**         | The question bank (30 questions, 13 evaluated from templates) lives in `packages/lens-questions`. `aws-well-architected` owns the review, evidence model, backlog, and comparison. `aws-architect review` is a **deprecated shim** over the same bank, limited to its original 11 questions; architect keeps `decisions`, `intake`, `plan`, `adr`. |
| **Files**         | Added `packages/lens-questions/**`, `plugins/aws-well-architected/**`. Changed `plugins/aws-architect/src/lib/review.ts` (adapter), `skills/review/SKILL.md` (deprecated), `package.json`. Nothing deleted.                                                                                                                                        |
| **Compatibility** | `/aws-architect:review` output shape is unchanged (`reviews[].answered[]`); a deprecation line is added to `needsOthers`.                                                                                                                                                                                                                          |
| **Test evidence** | `plugins/aws-architect/test` (19, passing on the shim); `plugins/aws-well-architected/test` (20).                                                                                                                                                                                                                                                  |
| **Known gaps**    | Specialist report mapping covers 13 rule ids (`SEC-*`, `OBS-*`); other findings are listed as unmapped, not dropped. The old `review` command is removed in the next major version.                                                                                                                                                                |

## Prototyping

**Not present** in any existing plugin. `aws-prototyping` is new code; `aws-architect` keeps the implementation plan and recommendations it already has.

## What stays where

`aws-infrastructure` keeps the reference graph (`inspect`) as **source data** for `aws-diagrams`; it gains no diagram code. `aws-ui` keeps footer labels and the status line; the panel that renders diagrams is a later milestone and consumes `DiagramArtifact` / `ArchitectureGraph` JSON only.

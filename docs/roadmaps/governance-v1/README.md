# Governance v1 migration

## Purpose

Migrate the existing Article6 corpus into the governance-v1 trust model without re-encoding source-audited methodology content unnecessarily.

The migration preserves historical evidence, existing deterministic artefacts, and legacy compatibility fields while making governance-v1 state authoritative.

## Canonical trust states

Use the following corpus lifecycle states as the authoritative governance-v1 vocabulary:

- `DISCOVERED`
- `SOURCES_CAPTURED`
- `DEPENDENCIES_MAPPED`
- `SECTIONS_COMPLETE`
- `RULES_COMPLETE`
- `PROVENANCE_COMPLETE`
- `RETRIEVAL_TESTED`
- `VERIFIED`
- `SUPERSEDED`
- `BLOCKED`

Legacy fields such as `grade_a_source_audited`, `review_grade`, `idempotent_verified`, and `methodology_linked_review_ready` may remain for compatibility, but they must not be treated as the canonical governance-v1 trust state.

Repository presence does not imply `VERIFIED`.

A component version may be marked `VERIFIED` only when required source, dependency, section, rule, provenance, version, schema/hash, semantic-review, and retrieval checks have passed.

## Migration rules

1. Preserve existing source-audited rules and sections unless a concrete source defect is found.
2. Never rewrite historical evidence merely to fit the new state model.
3. Resolve exact dependency versions from authoritative evidence. Do not copy the governing methodology version onto dependencies.
4. Distinguish mandatory, conditional, optional, informative, and incorporated-by-reference dependencies.
5. Keep current, historical, superseded, unknown, and not-applicable semantics distinct.
6. Derive coverage indexes from canonical corpus state where practical instead of manually maintaining competing truth sources.
7. Stop on integrity conflicts. Do not promote a component while hashes, lineage, dependency resolution, or retrieval tests disagree.

## Ordered migration queue

### PR 1 — Governance-v1 migration contract

Status: in progress

Scope:
- establish the canonical trust-state vocabulary
- define legacy-status compatibility behavior
- record the ordered cleanup queue

### PR 2 — VM0047 v1.0 integrity and lineage

Scope:
- reconcile conflicting hash metadata
- record v1.1 as successor
- capture version/date semantics needed for historical retrieval
- establish governance-v1 trust state only after integrity checks agree

### PR 3 — VM0007 v1.8 dependency normalization

Scope:
- remove mechanically versioned dependency identifiers
- resolve exact dependency versions from authoritative evidence already governed in the repository
- classify dependency relationships and applicability
- retain source-audited methodology rules unchanged unless a source defect is found

### PR 4 — Canonical coverage index

Scope:
- replace stale top-level coverage bookkeeping with a derived or governance-v1-aligned coverage view
- ensure VM0007 v1.8 and VM0047 v1.0 are represented correctly
- prevent legacy registry state from competing with canonical corpus state

### PR 5 — Gold Standard placeholder quarantine

Scope:
- prevent `GS-00XX` from appearing as production coverage
- preserve the artefact if it is a fixture/demo
- label or relocate it without deleting evidence

## After migration

The first new ingestion under governance v1 should be VM0047 v1.1.

Then complete VM0007 v1.8 dependency closure before adding a third Verra methodology.

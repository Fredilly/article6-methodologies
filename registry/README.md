# Registry (observability-only)

`registry/` holds lightweight, human-readable status/observability artifacts.

The canonical corpus remains the governed methodology/component artefacts and their validation state. Registry summaries must not become a competing source of truth.

## `coverage-governance-v1.json`

- Purpose: governance-v1 migration coverage view.
- Scope: explicitly states which audited component versions have or have not reached `VERIFIED`.
- During migration, prefer this file over legacy `methods-status.json` when discussing Article6 coverage.
- It is a migration snapshot, not a replacement for deriving coverage from canonical corpus state in the long term.

## `methods-status.json`

- Legacy observability artifact.
- Retained for compatibility and historical context.
- Not authoritative for governance-v1 trust state or current supported versions.

## `sectors.json`

- Purpose: track high-level per-sector status (expected method count, migration flags, notes).
- Scope: informational only (helps humans understand current state at a glance).
- Non-goal: this file is **not** a CI gate and must not block builds or releases.

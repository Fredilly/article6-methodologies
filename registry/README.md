# Registry (observability-only)

`registry/` holds lightweight, human-readable status/observability artifacts.

## `sectors.json`

- Purpose: track high-level per-sector status (expected method count, migration flags, notes).
- Scope: informational only (helps humans understand current state at a glance).
- Non-goal: this file is **not** a CI gate and must not block builds or releases.


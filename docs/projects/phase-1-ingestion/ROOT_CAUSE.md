# Article6 Root Cause Ledger

This file is the living logbook for non-trivial ingest/pipeline failures in the Article6 repository.

- Each new *class* of failure (not a typo) gets a new RC entry with an ID, summary, root cause, new invariant, and links back to the ingest plan and tests.
- The ingest plan (`ARTICLE6_INGEST_UPGRADE_PLAN.md`) stays as the phase/spec blueprint; this ledger keeps the incident history.

## How to use this file

- After fixing a new class of ingest/pipeline failure, fill out a new RC entry.
- Reference `ARTICLE6_INGEST_UPGRADE_PLAN.md` to decide whether a new invariant bullet is needed or the spec already covers it.
- Keep RC entries concise and focused on system-level changes (scripts, tests, invariants), not one-off data fixes.
- When adding a new RC entry, also add or update the corresponding invariant bullet in `ARTICLE6_INGEST_UPGRADE_PLAN.md`.

## Tagging

Each entry may include a line:

- `Tags: [tag1, tag2, ...]`

Recommended tags: `pdf`, `determinism`, `schema`, `registry`, `paths`, `tools`, `agriculture`, `forestry`, `ci`.

## Root Cause Index

Full writeups live in `docs/projects/phase-1-ingestion/root-causes/`. This file is a scannable ledger of entries.

- RC-2025-12-AR-AM0014-tool-parity | 2025-12-10 00:00:00 | AR-AM0014 tool ref mismatch (registry/tools/fixtures) | docs/projects/phase-1-ingestion/root-causes/RC-20251210-000000.md
- RC-20251221-120000 | 2025-12-21 12:00:00 | Batch ingest missing first-class batch→scope entrypoint | docs/projects/phase-1-ingestion/root-causes/RC-20251221-120000.md
- RC-20251221-120500 | 2025-12-21 12:05:00 | Scoped ingest portability failure (macOS mktemp/mapfile bashisms) | docs/projects/phase-1-ingestion/root-causes/RC-20251221-120500.md

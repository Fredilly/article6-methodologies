# Article6 Root Cause Ledger

This file is the living logbook for non-trivial ingest/pipeline failures in the Article6 repository.

- Each new *class* of failure (not a typo) gets a new RC entry with an ID, summary, root cause, new invariant, and links back to the ingest plan and tests.
- The ingest plan (`ARTICLE6_INGEST_UPGRADE_PLAN.md`) stays as the phase/spec blueprint; this ledger keeps the incident history.

## How to use this file

- After fixing a new class of ingest/pipeline failure, fill out a new RC entry.
- Reference `ARTICLE6_INGEST_UPGRADE_PLAN.md` to decide whether a new invariant bullet is needed or the spec already covers it.
- Keep RC entries concise and focused on system-level changes (scripts, tests, invariants), not one-off data fixes.
- When adding a new RC entry, also add or update the corresponding invariant bullet in `ARTICLE6_INGEST_UPGRADE_PLAN.md`.

## Root Cause Entries

### RC-2025-12-AR-AM0014-tool-parity

- **Name:** AR-AM0014 tool ref mismatch
- **Date:** 2025-12-10
- **Area:** registry / tools / fixtures
- **Symptom:**
  - AR-AM0014 `registry.tools[*].pointer` paths did not match the actual tool filenames under `tools/UNFCCC/Forestry/AR-AM0014/v03-0/`.
  - The mismatch only surfaced when we aligned Forestry gold fixtures and registry, not via an explicit parity check.
- **Root cause:**
  - Tools for AR-AM0014 were renamed/normalized on disk without updating the corresponding registry entries.
  - Forestry-gold fixtures did not include a `tools/` mirror for AR-AM0014, so our tests had no invariant tying tool filenames/paths to `registry.tools[*].pointer`.
- **New invariant:**
  - For any methodology that includes tools, the `tools/` directory must be mirrored in the corresponding `tests/fixtures/*-gold/.../tools/` folder, and CI parity checks must enforce that `registry.tools[*].pointer` paths and filenames match the on-disk tool files.
- **Spec update:**
  - Update the Phase 7/8 section of `ARTICLE6_INGEST_UPGRADE_PLAN.md` to:
    - Add the invariant bullet above to the list of ingestion/quality rules.
    - Note that tool parity (registry ↔ filesystem ↔ fixtures) is required before a method is considered Phase-8 complete.
- **Code/tests:**
  - Ensure the Forestry/Agriculture gold parity checks include tool paths:
    - Extend the existing parity script or tests to compare `registry.tools[*].pointer` against `tests/fixtures/*-gold/.../tools/*`.
    - Fail CI if any tool entry in `registry.json` lacks a corresponding on-disk file or fixture, or if names/paths diverge.
- **Golden fixtures touched:**
  - `tests/fixtures/forestry-gold/UNFCCC/Forestry/AR-AM0014/v03-0/tools/*` (primary exemplar).
  - Future Forestry/Agriculture methods with tools should follow the same pattern before being counted as gold exemplars.

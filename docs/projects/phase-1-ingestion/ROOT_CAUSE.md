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

## Where to look

- See `docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md` for the generated list of incidents.
- Full entries live in `docs/projects/phase-1-ingestion/root-causes/`.

## RC Entry Template

```md
# RC-YYYYMMDD-HHMMSS — <short title>
- Date:
- Area:
Tags: [ ... ]   (optional)

## Symptom
## Impact
## Root cause
## Fix
## New invariants / guardrails
## Proof / tests
## Follow-ups
```

## Quick Commands

- Create entry (one-shot): `npm run root-cause:new -- --title "Registry scope drift" --area "registry" --tags "registry, ci" --symptom "CI failed with: ... " --root-cause "We used ... " --fix "Pin ... " --proof "npm run validate:json" --follow-ups "- [ ] Add regression test"`
- Regenerate index: `npm run root-cause:index`
- Dev smoke check (creates + cleans up): `node scripts/smoke-root-cause-new.mjs`
- Sanity: `npm run validate:json`

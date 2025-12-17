# Phase-1 Ingestion Docs

## Root cause ledger

- Root-cause entries live in `docs/projects/phase-1-ingestion/ROOT_CAUSE.md`.
- Open the ledger from the CLI with `npm run root-cause:open` to review or append entries right after fixing a new ingest/pipeline failure.

Keep ledger updates in sync with the invariants captured inside `ARTICLE6_INGEST_UPGRADE_PLAN.md`.

## Root cause workflow

`ROOT_CAUSE.md` holds the full incident history, and `ARTICLE6_INGEST_UPGRADE_PLAN.md` is the source of truth for ingest invariants.

- `npm run root-cause:open` — open the ledger in read-only mode to review prior incidents.
- `npm run root-cause:new "[short title]"` — create a timestamped RC scaffold under `docs/projects/phase-1-ingestion/root-causes/`, append a pointer to the ledger, and print the new file path for immediate editing.

### Sector naming

The internal sector code `forestry` (used in folder names like
`UNFCCC/Forestry` and fixtures such as `forestry-gold`) corresponds to
UNFCCC sector 14, **“Afforestation and reforestation”**.
We keep the slug stable for hashing and reproducibility, but any
external-facing report or model should use the full label
“Afforestation and reforestation (UNFCCC 14)”.

## Scoped ingest invariant

- Scoped ingest must not modify paths outside the declared ingest scope; the `node scripts/check-scope-drift.mjs` gate enforces this invariant.
- Run `npm run ingest:scoped:idempotent -- <ingest.yml>` to execute the scoped ingest twice, assert `git diff --exit-code`, and re-check for scope drift before promoting a sector run.

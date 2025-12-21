# Phase-1 Ingestion Docs

## Root cause ledger

- Root-cause entries live in `docs/projects/phase-1-ingestion/ROOT_CAUSE.md`.
- Open the ledger from the CLI with `npm run root-cause:open` to review or append entries right after fixing a new ingest/pipeline failure.

Keep ledger updates in sync with the invariants captured inside `ARTICLE6_INGEST_UPGRADE_PLAN.md`.

## Root cause workflow

`ROOT_CAUSE.md` holds the full incident history, and `ARTICLE6_INGEST_UPGRADE_PLAN.md` is the source of truth for ingest invariants.

- `npm run root-cause:open` — open the ledger in read-only mode to review prior incidents.
- `npm run root-cause:new -- --title "[short title]"` — create a timestamped RC entry under `docs/projects/phase-1-ingestion/root-causes/` and print the new file path.

## Ingest a batch

`npm run ingest:batch -- --codes batches/agri-ams-iii.codes.txt --out ingest.agri-ams-iii.yml`

### Sector naming

The internal sector code `forestry` (used in folder names like
`UNFCCC/Forestry` and fixtures such as `forestry-gold`) corresponds to
UNFCCC sector 14, **“Afforestation and reforestation”**.
We keep the slug stable for hashing and reproducibility, but any
external-facing report or model should use the full label
“Afforestation and reforestation (UNFCCC 14)”.

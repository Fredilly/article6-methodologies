# Phase 1 Ingestion — Persistent Checklist

## Start here

Run these first to answer “where are we?” before reading CI badges or guessing:

- `npm run status`
- `npm run status:sectors`
- `npm run status:methods`

Rule: ignore GitHub folder/file check badges unless the corresponding workflow is failing on `main` **HEAD** (prefer `gh pr checks <PR>` / `gh run list --branch main` over folder badges).

## Baseline hygiene

- `npm run validate:rich`
- `npm run validate:lean`
- `node scripts/validate-offline.js`

## Previous versions (canonical paths)

- Previous versions indices/locks live under `registry/<Program>/<Sector>/previous-versions.json` and `registry/<Program>/<Sector>/previous-versions.lock.json` (no `source-assets/**` duplication).


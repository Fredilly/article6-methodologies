# Changelog

## Lock strict unpadded versioning
- Normalize every UNFCCC methodology/tool/source-assets path to canonical `vX-Y` directories (Agriculture + Forestry), retaining evidence under `reports/`.
- Tighten schema/validator patterns to require `@?vX-Y(-Z)` without padding and regenerate the AJV bundles.
- Make the version-format preflight run with `--strict` in CI and upload `audit/version-format-scan.json` on every job.
- Refresh downstream datasets, docs, and scripts so rule IDs, anchors, and pointer files match the unpadded canonical format.

# Rule-Type Dataset

 feat/rule-type-dataset
Manual labels that classify individual rule excerpts (logic, summary, notes) into functional categories.

## Files
- `labels.yaml` — allowed category names.
- `rules.csv` — columns: `method_tag`, `anchor`, `text`, `label`.
- `META.json` — git commit, SHA-256 checksums, and sizes for the dataset files.

## Workflow
1. Append new rows to `rules.csv` (keep it sorted by `method_tag`, then `anchor`).
2. Only use labels listed in `labels.yaml`; update the YAML if a new category is needed and re-run reviewers by hand.
3. Run `./scripts/hash-all.sh` so methodology `META` automation pins stay in sync.
4. Run `npm run validate:rich` and `npm run validate:lean` before committing.
5. Commit the CSV/YAML/META together with a signed-off message.

Curated labels mapping forestry methodology rules to functional categories (eligibility, leakage, monitoring, etc.). Entries are keyed by canonical rule IDs from UNFCCC AR-AMS0003 v01-0 and AR-AMS0007 v03-1.

## Files
- `rules.csv` — columns: `rule_id`, `rule_type`, `notes`.

## Updating
1. Add new labeled rows to `rules.csv` (sorted lexicographically by rule ID).
2. Run `./scripts/hash-all.sh` to refresh `META` automation pins and `scripts_manifest.json`.
3. Commit with sign-off, referencing evidence or rationale for new labels.
 main

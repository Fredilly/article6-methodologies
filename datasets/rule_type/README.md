# Rule-Type Dataset

Curated labels mapping forestry methodology rules to functional categories (eligibility, leakage, monitoring, etc.). Entries are keyed by canonical rule IDs from UNFCCC AR-AMS0003 v01-0 and AR-AMS0007 v03-1.

## Files
- `rules.csv` — columns: `rule_id`, `rule_type`, `notes`.

## Updating
1. Add new labeled rows to `rules.csv` (sorted lexicographically by rule ID).
2. Run `./scripts/hash-all.sh` to refresh `META` automation pins and `scripts_manifest.json`.
3. Commit with sign-off, referencing evidence or rationale for new labels.

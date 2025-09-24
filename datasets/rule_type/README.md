# Rule-Type Dataset

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

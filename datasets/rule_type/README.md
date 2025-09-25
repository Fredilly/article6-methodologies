# Rule-Type Dataset

Manual annotations linking methodology rules to coarse categories.

- `rules.csv` — primary annotations (`method_tag`, `anchor`, `text`, `label`).
- `rules_meta.csv` — per-rule summary (`rule_id`, `rule_type`, `notes`).
- `labels.yaml` — allowed categories.

Update steps: edit CSVs, keep labels within `labels.yaml`, run `./scripts/hash-all.sh`, then run rich/lean validators before committing.

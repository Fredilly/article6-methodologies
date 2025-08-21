# Methodology Pack Structure

```
methodologies/<CODE>/
  rules.json        # machine-readable checks; each check cites sections.json + page
  META.json         # versioning + source_docs SHA-256
  sections.json     # human-readable outline; stable section ids
  overrides/        # country-specific overrides (optional)
  source_pdfs/      # source docs (if redistributable) or placeholder
  tools/            # pack-local utilities (optional)
```

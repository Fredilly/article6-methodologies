# Provenance

- All methodology rules are extracted from official sources. Each check in `rules.json` cites `sections.json#section_id` and a PDF page.
- On version bumps, update `META.json` (methodology_version, source_docs SHA-256) and `registry/registry.json`.
- Determinism: reports must follow `contracts/compliance-report.v1.json`; same inputs → same bytes.

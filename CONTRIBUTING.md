# Contributing

- **Explainable compliance**: each `rules.json` check cites `sections.json#section_id` and PDF page.
- **Determinism**: Reports follow `contracts/compliance-report.v1.json` and must be byte-identical for the same inputs.
- **Integrity**: Update `META.json` and `registry/registry.json` on version bumps; include SHA-256 for source docs.

## Dev loop
```bash
nvm use
npm ci || npm install
npm run validate
```

## New methodology
- Create `methodologies/<CODE>/{rules.json,META.json,sections.json,source_pdfs/}`
- Register in `registry/registry.json`
- Add 2 fixtures + expected reports under `tests/`

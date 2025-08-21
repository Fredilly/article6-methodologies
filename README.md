# article6-methodologies

[![validate](https://github.com/Fredilly/article6-methodologies/actions/workflows/validate.yml/badge.svg)](https://github.com/Fredilly/article6-methodologies/actions/workflows/validate.yml)

Methodology packs and schemas for the Article6 Automated Carbon Compliance Agent.

## Quick start
```bash
nvm use
npm ci || npm install
npm run validate
```

## Determinism
Same inputs → same bytes. Reports conform to `contracts/compliance-report.v1.json`. CI generates reports from fixtures and compares them to `tests/expected`.

## Add a methodology
1) Create `methodologies/<CODE>/{rules.json,META.json,sections.json,source_pdfs/}`  
2) Register in `registry/registry.json`  
3) Add fixtures + expected reports under `tests/`  
4) `npm run validate`

# Requirement Coverage Methodology Adjustments

This project folder carries implementation notes for the requirement-coverage roadmap work.

- Roadmap status SSOT: `docs/roadmaps/requirement-coverage-support/phase-status.json`
- Current proving focus: scoped, deterministic execution hardening for RC-S7
- Canonical methodology schemas and generated methodology artifacts live in this repo.
- `app.article6` must consume new rich canon fields from `article6-methodologies`; it must not define or fork canonical methodology fields locally.
- Evidence-intake or app phases that need new rich canon fields should open an upstream PR here first.

## RC-S7

RC-S7 hardens the ingest execution layer without expanding lean methodology contracts.

- preflight checks fail early on missing ingest inputs and required tooling
- scoped ingest reports failure phases clearly
- scoped drift is checked immediately after generation and again after finalization
- deterministic reruns remain enforced on the proving methodology path

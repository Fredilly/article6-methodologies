# Traceable Rule Review MVP

Status: `docs/roadmaps/traceable-rule-review-mvp/phase-status.json`.

## Goal

Provide canonical rule contract support so the app can build a traceable rule review workspace. This repo owns **methodology semantics, schema definitions, and data quality**. It does NOT own UI, workflow, persistence, or export execution. That is the app repo.

Cross-reference: [app roadmap](https://github.com/Fredilly/app.article6/tree/main/docs/roadmaps/traceable-rule-review-mvp).

## Repo boundary

This roadmap defines what methodology data must contain for the app to consume it. Schema contracts, rule metadata quality, and evidence type definitions live here. Implementation of review UI, API endpoints, and export logic lives in the app repo.

## How existing pieces fit

| Piece | Current state | Contract responsibility here |
|-------|--------------|------------------------------|
| **Methods** | `rules.rich.json` with id, summary, logic, type, refs, tags, when | Must provide: text for display, section anchors for navigation, type for STAC eligibility filtering |
| **Complex methods** | Version lineage (RC-S5), diff metadata | Must provide: stable IDs across versions, version relationship metadata |
| **AOI** | App-side only | No contract work needed — app handles AOI geometry |
| **STAC eligibility** | Tags exist (`monitoring`, `baseline`, `emissions`) but no explicit STAC flag | Must define: which rule types/tags indicate satellite evidence eligibility |
| **Evidence types** | `requirement_coverage.expected_evidence` in schema (RC-S6) | Must populate: structured evidence hints per rule |
| **Manual review flags** | `requirement_kind` field exists but sparse | Must populate: which rules require human judgment vs. calculable |

## Priority

truthfulness > defensibility > clean repo boundaries > data completeness

## Phases

All five phases are strict. Each builds on the previous. Phase IDs and titles match the app repo exactly.

---

## T-1 — Rule Review Record (data contract)

### Goal

Ensure every rule has the minimum data the app needs to display a review panel.

### Contract requirements

- `text` or `summary` — non-empty string the app displays as the rule's requirement
- `refs.section_anchor` — valid anchor linking to the methodology PDF section
- `refs.primary_section` — section ID for navigation
- `type` — one of: eligibility, parameter, equation, calc, monitoring, leakage, uncertainty, reporting
- `tags` — array of strings for filtering (existing: baseline, emissions)
- `id` and `stable_id` — both present and consistent

### What to verify/fix

- Every rule in AR-ACM0003 v02-0 `rules.rich.json` has non-empty text/summary
- Section anchors in `sections.rich.json` resolve to valid positions
- `META.json` references are complete

### Files to check

- `methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/rules.rich.json`
- `methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/sections.rich.json`
- `methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/META.json`

### Acceptance criteria

- [ ] Every rule has non-empty `summary` or equivalent display text
- [ ] Every rule has `refs.section_anchor`
- [ ] Every rule has a valid `type`
- [ ] Section anchors resolve to existing sections
- [ ] All CI tests pass

---

## T-2 — Defensible Verification (evidence contract)

### Goal

Define what evidence types are supportable per rule type. The app uses this to know what fields to show.

### Contract requirements

- Populate `requirement_coverage.expected_evidence` for rules where grounded
- Define evidence type taxonomy:
  - `monitoring_report` — periodic project reports
  - `satellite_imagery` — STAC-sourced scenes
  - `calculation_workbook` — baseline/removals/leakage spreadsheets
  - `project_document` — PDD, methodology documents
  - `field_measurement` — on-site measurements
  - `third_party_verification` — prior audit findings
- Map rule types to expected evidence types (e.g., `monitoring` rules expect `monitoring_report` + `satellite_imagery`)
- Populate `requirement_kind` to distinguish: human-judgment-required vs. calculable vs. document-check

### Files to modify

- `schemas/rules.rich.schema.json` — ensure evidence type enum if needed
- `methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/rules.rich.json` — populate expected_evidence where grounded
- `docs/ingest/ENCODING_PLAYBOOK.md` — document evidence type mapping

### Acceptance criteria

- [ ] Evidence type taxonomy documented
- [ ] At least 3 rules have `requirement_coverage.expected_evidence` populated
- [ ] `requirement_kind` populated for rules where human judgment is vs. is not required
- [ ] Schema validates populated evidence fields

---

## T-3 — STAC / AOI Support Facts (eligibility flags)

### Goal

Define which rules are eligible for STAC satellite support facts. The app uses this to auto-trigger STAC search.

### Contract requirements

- Define STAC eligibility criteria based on rule metadata:
  - Rules tagged `monitoring` → STAC eligible
  - Rules with `type: monitoring` → STAC eligible
  - Rules tagged `satellite` or `remote-sensing` → STAC eligible (add these tags where appropriate)
  - All other rules → NOT STAC eligible
- Add explicit `stac_eligible` flag to rule metadata OR document the tag-based heuristic clearly
- Ensure rules.rich.json tags are complete enough for the app to filter

### Tag taxonomy (add where missing)

- `satellite` — evidence can come from satellite imagery
- `remote-sensing` — synonym for satellite
- `monitoring` — requires periodic monitoring evidence
- `baseline` — baseline scenario determination
- `emissions` — emissions calculation
- `leakage` — leakage assessment
- `calculation` — quantitative calculation

### Files to modify

- `methodologies/UNFCCC/Forestry/AR-ACM0003/v02-0/rules.rich.json` — add tags where missing
- `docs/ingest/ENCODING_PLAYBOOK.md` — document tag taxonomy and STAC eligibility rules

### Acceptance criteria

- [ ] Tag taxonomy documented
- [ ] STAC eligibility heuristic documented (tag-based or explicit flag)
- [ ] AR-ACM0003 rules have appropriate tags for satellite eligibility
- [ ] App can determine STAC eligibility from rule metadata alone

---

## T-4 — Document and Workbook Support (extraction contracts)

### Goal

Define what structured facts can be extracted from project documents and workbooks. The app uses this for evidence support.

### Contract requirements

- Document baseline/removals/leakage calculation formulas for AR-ACM0003
- Define workbook column/field expectations for:
  - Baseline scenario values
  - Project scenario values
  - Leakage estimates
  - Uncertainty ranges
- Define PDD section extraction targets (which sections map to which rules)
- Define monitoring report extraction targets

### Files to create/modify

- `docs/examples/baseline-calculation-template.md` — calculation formula documentation
- `docs/examples/workbook-field-expectations.md` — what the app should expect in workbooks
- `datasets/param-extraction/` — parameter extraction test fixtures (extend if needed)

### Acceptance criteria

- [ ] Baseline calculation formulas documented for AR-ACM0003
- [ ] Workbook field expectations defined (column names, units, ranges)
- [ ] At least one test fixture workbook exists for validation
- [ ] PDD section → rule mapping documented for AR-ACM0003

---

## T-5 — Exportable Verification Output (schema contracts)

### Goal

Define the schema for verification output. The app generates the document; this repo defines what it must contain.

### Contract requirements

- Define verification snapshot schema:
  - Project metadata (methodology, version, AOI)
  - Rule reviews array (id, status, rationale, support_reference, evidence_links, reviewer, timestamp)
  - Provenance chain (who reviewed, when, app version)
  - STAC support facts (for eligible rules)
  - Aggregated summary (% reviewed, % verified, open items)
- Ensure schema is JSON Schema validatable
- Document export invariants (what must be true for a valid export)

### Files to create/modify

- `schemas/verification-snapshot.schema.json` (new)
- `docs/examples/verification-snapshot-example.json` (new)
- `tests/verification-snapshot-schema.test.js` (new)

### Acceptance criteria

- [ ] Verification snapshot schema defined and valid JSON Schema
- [ ] Example snapshot passes schema validation
- [ ] Schema covers all 5 phase deliverables
- [ ] CI test validates example against schema

---

## What this roadmap excludes

- UI implementation (owned by app repo)
- API endpoints (owned by app repo)
- PDF generation (owned by app repo)
- STAC search implementation (owned by app repo)
- Project management (owned by app repo)
- Authentication / access control (owned by app repo)

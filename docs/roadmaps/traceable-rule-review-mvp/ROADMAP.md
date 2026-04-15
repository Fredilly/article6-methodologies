# Traceable Rule Review MVP

SSOT: `docs/roadmaps/traceable-rule-review-mvp/phase-status.json`

## Repo boundary

This roadmap owns **methodology semantics, schema definitions, and data quality**. It does NOT own UI, workflow, persistence, or export execution. That is the app repo: [traceable-rule-review-mvp](https://github.com/Fredilly/app.article6/tree/main/docs/roadmaps/traceable-rule-review-mvp).

## Goal

Provide canonical rule contract support so the app can build a traceable rule review workspace. The app consumes what this repo produces — schemas, rule metadata quality, evidence type definitions.

## How existing pieces fit

| Piece | Where it lives | Contract responsibility |
|-------|---------------|------------------------|
| Methods | `rules.rich.json` — id, summary, logic, type, refs, tags | Must provide: display text, section anchors, type for STAC eligibility |
| Complex methods | Version lineage (RC-S5) | Must provide: stable IDs across versions, version relationships |
| STAC eligibility | Tags exist (`monitoring`, `baseline`) but no explicit flag | Must define: which rules are satellite-eligible |
| Evidence types | `requirement_coverage.expected_evidence` (RC-S6) | Must populate: structured evidence hints per rule |
| Manual review flags | `requirement_kind` field exists but sparse | Must populate: human-judgment-required vs. calculable |

## Priority

truthfulness > defensibility > clean repo boundaries > data completeness

## PR body standard

For every PR related to this roadmap:

```
Roadmap: traceable-rule-review-mvp
Roadmap-Phase: <phase-id>
SSOT: docs/roadmaps/traceable-rule-review-mvp/phase-status.json
```

## Phases

### Phase 1 — Rule Review Record (data contract)

Ensure every rule has minimum data the app needs for a review panel.

- `text` or `summary`: non-empty string for display
- `refs.section_anchor`: valid anchor linking to methodology PDF
- `refs.primary_section`: section ID for navigation
- `type`: one of eligibility, parameter, equation, calc, monitoring, leakage, uncertainty, reporting
- `tags`: array for filtering (baseline, emissions, etc.)
- `id` and `stable_id`: both present, consistent

Verify AR-ACM0003 v02-0 `rules.rich.json` and fix gaps.

### Phase 2 — Defensible Verification (evidence contract)

Define evidence types supportable per rule type.

- Evidence type taxonomy: monitoring_report, satellite_imagery, calculation_workbook, project_document, field_measurement, third_party_verification
- Map rule types → expected evidence types
- Populate `requirement_coverage.expected_evidence` where grounded
- Populate `requirement_kind`: human-judgment-required vs. calculable vs. document-check

### Phase 3 — STAC / AOI Support Facts (eligibility flags)

Define which rules are eligible for STAC satellite support.

- STAC eligibility criteria from rule metadata
- Tag taxonomy: satellite, remote_sensing, monitoring, baseline, emissions, leakage, calculation
- Rules tagged `monitoring` → STAC eligible
- Document the heuristic clearly in encoding playbook

### Phase 4 — Document and Workbook Support (extraction contracts)

Define what structured facts can be extracted from documents.

- Baseline/removals/leakage calculation formulas for AR-ACM0003
- Workbook column/field expectations (names, units, ranges)
- PDD section → rule mapping
- Monitoring report extraction targets

### Phase 5 — Exportable Verification Output (schema contracts)

Define the schema for verification output the app generates.

- Verification snapshot schema (JSON Schema)
- Project metadata, rule reviews array, provenance chain, STAC facts, aggregated summary
- Example snapshot passes validation
- CI test for schema compliance

## What this excludes

- UI implementation (owned by app repo)
- API endpoints (owned by app repo)
- PDF generation (owned by app repo)
- STAC search implementation (owned by app repo)
- Project management (owned by app repo)

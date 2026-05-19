# Review-Grade Evidence Intelligence

Status is sourced from `docs/roadmaps/review-grade-evidence-intelligence/phase-status.json`; docs must not drift.

**Ownership boundary**: `article6-methodologies` defines the Review-Grade methodology pack standard, the expected evidence taxonomy, and the rule-to-evidence mapping schema. `app.article6` consumes these artifacts to drive evidence pickers, review panels, and export composers — it must not invent evidence categories or pack quality tiers.

## Why this matters

The Source-Audited standard guarantees that every rule has a verifiable source span and no `draft_unverified` gaps. However, it does not describe *what evidence a reviewer must examine* to verify each rule. Without structured evidence metadata:

- The app cannot show reviewers which document types are expected per rule
- Evidence pickers must rely on hardcoded heuristics that drift across methods
- Export composers cannot produce standard-compliant evidence tables
- Deterministic linking between rules and uploaded evidence is impossible

This roadmap formalizes the Review-Grade pack standard — the next quality tier above Source-Audited — and delivers the evidence taxonomy and mapping schema the app needs for deterministic evidence linking.

## How this fits with existing roadmaps

| Roadmap | Relationship |
|---------|-------------|
| `traceable-rule-review-mvp` | Phase 2 seeded `requirement_coverage.expected_evidence` as an optional field. This roadmap makes it mandatory at Review-Grade and formalizes the taxonomy. |
| `standard-specific-export-metadata` | Defines standard-level evidence categories (Verra, Gold Standard). This roadmap defines rule-level expected evidence types that feed into those categories. |
| `requirement-coverage-support` | RC-S6 added optional `expected_evidence` metadata. This roadmap hardens that into a Review-Grade requirement. |

## Scope for this roadmap

- Define the Review-Grade Method Pack Standard as a formal quality tier above Source-Audited
- Publish the expected evidence taxonomy: machine-readable categories every rule can reference
- Create the rule-to-evidence mapping JSON Schema for `rules.rich.json`
- Populate expected evidence metadata across target method packs
- Define the app consumption contract for evidence intelligence fields
- Do not change the existing rule schema or source-audited artifacts without review
- Do not build app UI, evidence upload, or review workflow

## Phases

### RGEI-S1 — Review-Grade Method Pack Standard

Objective: Formalize the Review-Grade quality standard as a documented, machine-verifiable tier.

- Publish `docs/standards/review-grade-method-pack-standard.md`
- Define the Review-Grade adoption criteria relative to Source-Audited
- Add the standard's machine-readable fields (`adoption_status: "review_grade"`)
- Document transition path from Source-Audited to Review-Grade
- Define CI verification gates

Acceptance:
- Standard document published and reviewed
- Schema permits `adoption_status: "review_grade"` as a valid value
- Transition path documented with examples

### RGEI-S2 — Expected Evidence Taxonomy

Objective: Publish a canonical taxonomy of evidence types that methodology rules can reference.

- Define top-level evidence categories (document, geospatial, calculation, field measurement, attestation)
- Define evidence kinds per category (mandatory, optional, conditional)
- Define evidence attributes (format, source requirement, temporal scope)
- Publish taxonomy in `docs/standards/expected-evidence-taxonomy.md`
- Publish JSON Schema in `schemas/evidence-taxonomy.schema.json`

Acceptance:
- Taxonomy document published with full category definitions
- JSON Schema validates taxonomy instances
- Every category has a clear definition, example, and usage guidance

### RGEI-S3 — Rule-to-Evidence Mapping Schema

Objective: Create the JSON Schema for expected evidence metadata in `rules.rich.json`.

- Define `requirement_coverage.expected_evidence[]` schema
  - `evidence_type_id`: references the taxonomy
  - `evidence_kind`: mandatory, optional, conditional
  - `evidence_condition`: expression when `evidence_kind` is conditional
  - `description`: human-readable guidance
  - `format`: pdf, xlsx, geotiff, csv, etc.
- Define `requirement_coverage.requirement_kind` schema
  - `human-judgment-required`, `calculable`, `document-check`
- Publish schema in `schemas/rule-evidence-mapping.schema.json`
- Update existing `schemas/rules.rich.schema.json` if reviewed

Acceptance:
- Schema validates expected_evidence entries
- Schema enforced in CI for Review-Grade methods

### RGEI-S4 — Methodology Pack Integration

Objective: Integrate evidence metadata into methodology pack artifacts.

- Populate `requirement_coverage.expected_evidence` across target methods
- Ensure pack scripts include evidence metadata
- Verify deterministic generation with evidence fields populated
- Add CI checks that Review-Grade methods have complete evidence metadata

Acceptance:
- Target methods have populated expected_evidence per rule
- Pack tarballs include complete evidence metadata
- CI fails if a Review-Grade method is missing required evidence metadata

### RGEI-S5 — App Consumption Contract

Objective: Define the exact JSON fields the app reads for evidence intelligence.

- Document the app-facing contract in `docs/roadmaps/review-grade-evidence-intelligence/app-consumption-contract.md`
- Pin contract version in META.json (`export.evidence_intelligence_version`)
- Every field needed by the app has a corresponding source in `rules.rich.json`
- CI validates contract compliance

Acceptance:
- Contract document published with field types, examples, and optionality
- META.json version tag present for Review-Grade methods
- No field in the contract lacks a populated source

### RGEI-S6 — Pilot Method Packs at Review-Grade

Objective: Promote at least one method pack to Review-Grade status for pilot consumption.

- Select target method (e.g., AR-ACM0003 v02-0 or VM0007 v1-8)
- Populate expected_evidence for every rule
- Set `adoption_status: "review_grade"` in META.json
- Verify all CI gates pass
- Publish updated pack

Acceptance:
- At least one method pack at Review-Grade
- CI green across all gates
- App can consume evidence metadata from the pack

## Delivery constraints

- Do not build app UI, evidence upload, or review workflow here
- Do not change existing rule schema or source-audited artifacts without review
- Do not break existing Source-Audited methods during transition
- All evidence metadata must be deterministic (same input → same bytes)
- Evidence taxonomy must be extensible: adding a new type must not break existing mappings
- Ownership boundary is strict: methodologies repo defines semantics; app repo consumes them

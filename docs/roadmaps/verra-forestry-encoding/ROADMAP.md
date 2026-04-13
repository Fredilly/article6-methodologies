# Verra Forestry Encoding

Status is sourced from `docs/roadmaps/verra-forestry-encoding/phase-status.json`; docs must not drift.

Goal: encode Verra and Gold Standard forestry methodology rules so `app.article6` can offer end-to-end verification against the standards VVBs actually use, not just UNFCCC.

## Why this matters

The app can currently verify against UNFCCC forestry methods (AR-AM0014, AR-ACM0003, AR-AMS0003, AR-AMS0007 — 4 methods, 42 rules total across versions). Verra VM0007 and Gold Standard GS-00XX are stubs with zero rules. VVBs doing Article 6 forestry verification primarily use Verra VCS. Without encoded Verra rules, the product cannot claim to support the market it targets.

## Scope for this roadmap

- Source and ingest real Verra VM0007 v1.6 (Improved Forest Management) methodology PDF
- Extract and encode applicability conditions, eligibility criteria, and monitoring requirements as structured rules
- Do the same for Gold Standard LUF methodology
- Maintain the same rule schema, rich-rule contract, and section structure already established for UNFCCC methods
- Preserve deterministic generation, auditability, and pack publishing guarantees

## Layering rules

- `rules.json` stays lean: id, title, text, section, type
- `rules.rich.json` carries logic, notes, refs, stable_id, summary, when, requirement_coverage
- `sections.json` and `sections.rich.json` follow existing schema
- All new methods follow the same META.json structure with proper provenance, audit hashes, and tool references

## Phases

### VF1 — Source real Verra VM0007 PDF

Objective: replace the 45-byte ASCII placeholder with the actual VM0007 v1.6 methodology PDF from Verra.

Scope:
- Download VM0007 v1.6 from verra.org
- Place in `tools/Verra/VM0007/v1-6/source.pdf`
- Update META.json with real PDF hash, size, and URL provenance

Acceptance:
- `tools/Verra/VM0007/v1-6/source.pdf` is a real PDF (>100KB)
- META.json references.tools entry has correct sha256 and url

### VF2 — Extract VM0007 sections

Objective: define the section structure for VM0007 before encoding individual rules.

Scope:
- Read VM0007 v1.6 PDF and identify major sections (applicability conditions, baseline scenario, demonstration of additionality, monitoring, etc.)
- Create `sections.json` and `sections.rich.json` with section IDs, titles, and page anchors
- Match the section schema used by UNFCCC forestry methods

Acceptance:
- `sections.json` has 8-15 sections covering VM0007's full structure
- Each section has id, title, and page/anchor locator

### VF3 — Encode VM0007 rules

Objective: extract every verifiable requirement from VM0007 as a structured rule.

Scope:
- For each section, extract applicability conditions, eligibility criteria, quantitative requirements, and monitoring obligations
- Create `rules.json` with id, title, text, section, type for each requirement
- Create `rules.rich.json` with logic, notes, refs, stable_id, summary, when fields
- Target: 25-40 rules covering the full VM0007 methodology

Acceptance:
- `rules.json` has 25+ rules
- Every rule maps to a section
- Rules cover: applicability, baseline, additionality, leakage, carbon accounting, monitoring, uncertainty
- `rules.rich.json` has enriched logic and refs for each rule

### VF4 — Source and encode Gold Standard LUF

Objective: repeat the process for Gold Standard Land-use & Forests methodology.

Scope:
- Source the GS LUF methodology PDF
- Extract sections and rules following the same schema
- Create rules.json, rules.rich.json, sections.json, sections.rich.json for GS-00XX

Acceptance:
- GS-00XX has real source PDF
- 15+ rules encoded covering GS LUF requirements

### VF5 — Cross-method tool references

Objective: link shared tools (IPCC defaults, leakage tools, permanence buffers) across methods where they apply.

Scope:
- Identify tools referenced by VM0007 that overlap with UNFCCC tools already in the repo
- Add cross-references in META.json and rules.rich.json refs
- Keep tool references auditable with path and hash

Acceptance:
- Shared tools (e.g., IPCC Tier 1 defaults, leakage assessment) are referenced consistently across UNFCCC and Verra methods
- No duplicate tool files; references point to canonical locations

## Delivery constraints

- Do not build app UI here
- Do not change the rule schema; use existing contracts
- Do not break existing UNFCCC method packs
- All generation must be deterministic and CI-safe

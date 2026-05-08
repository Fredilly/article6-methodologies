# Verra Forestry Encoding

Status is sourced from `docs/roadmaps/verra-forestry-encoding/phase-status.json`; docs must not drift.

Goal: encode Verra forestry methodology support so methodology-linked reviews can be consumed by `app.article6` after encoding, starting with VM0007 and leaving room for later Verra forestry methods.

## Why this matters

The app can currently verify against UNFCCC forestry methods (AR-AM0014, AR-ACM0003, AR-AMS0003, AR-AMS0007 - 4 methods, 42 rules total across versions). Verra VM0007 and related forestry methods are stubs with zero rules. VVBs doing Article 6 forestry verification primarily use Verra VCS. Without encoded Verra forestry artefacts, the product cannot claim to support that market.

## Scope for this roadmap

- Source and verify the real Verra VM0007 v1.8 REDD+ Methodology Framework PDF and canonical metadata
- Extract VM0007 sections first, then encode VM0007 rules as a separate phase
- Add explicit tool/module dependency handling for Verra-specific dependencies and references
- Leave room for follow-on Verra forestry methods such as VM0047 and VM0048 after VM0007
- Treat `app.article6` as a downstream consumer only; do not place UI or app implementation work in this repo
- Maintain the same rule schema, rich-rule contract, and section structure already established for UNFCCC methods
- Preserve deterministic generation, auditability, and pack publishing guarantees

## Layering rules

- `rules.json` stays lean: id, title, text, section, type
- `rules.rich.json` carries logic, notes, refs, stable_id, summary, when, requirement_coverage
- `sections.json` and `sections.rich.json` follow existing schema
- All new methods follow the same META.json structure with proper provenance, audit hashes, and tool references
- `review_contract_v1` is the first repo-wide high-quality artifact standard: lean artifacts stay stable runtime payloads, rich artifacts expose verifier-grade review shape, and missing enrichment must be explicit and machine-readable
- VM0007 `v1.8` is the first methodology adopting `review_contract_v1`; other methodologies may remain on the older shape until explicitly migrated

## Phases

### VF1 — Source real Verra VM0007 PDF

Objective: verify the canonical Verra source for VM0007 and capture truthful provenance for the active `v1.8` methodology PDF.

Scope:
- Use Verra's canonical VM0007 methodology page as the source of truth
- Target `VM0007 REDD+ Methodology Framework (REDD+MF), v1.8`, active since `2024-06-04`
- Verify the real methodology PDF at `tools/Verra/VM0007/v1-8/source.pdf`
- Record the canonical methodology page URL, canonical download URL, SHA-256, file size, and the fact that older versions exist only for lineage/history
- Do not imply section extraction or rule coverage exists yet

Acceptance:
- `tools/Verra/VM0007/v1-8/source.pdf` is the real Verra PDF and matches the canonical download
- `methodologies/Verra/AFOLU/VM0007/v1-8/META.json` and `docs/roadmaps/verra-forestry-encoding/vf1-source-vm0007-pdf.json` record truthful provenance for `v1.8`
- Existing `sections.json`, `sections.rich.json`, `rules.json`, and `rules.rich.json` remain retained draft seed artifacts until they are audited against the verified source PDF

### VF2 — Extract VM0007 sections

Objective: define the section structure for VM0007 `v1.8` before encoding individual rules.

Scope:
- Read VM0007 v1.8 PDF and identify major sections (applicability conditions, baseline scenario, demonstration of additionality, monitoring, etc.)
- Create `sections.json` and `sections.rich.json` with section IDs, titles, and page anchors
- Match the section schema used by UNFCCC forestry methods
- Treat the current retained section artifacts as draft seeds only until that audit is completed
- Normalize retained draft sections to the `review_contract_v1` field shape so missing locator quality remains explicit during audit

Acceptance:
- `sections.json` has 8-15 sections covering VM0007's full structure
- Each section has id, title, and page/anchor locator
- VM0007 section artifacts are not treated as review-ready until their draft/unverified status is cleared in metadata

### VF3 — Encode VM0007 rules

Objective: extract every verifiable requirement from VM0007 as a structured rule.

Scope:
- For each section, extract applicability conditions, eligibility criteria, quantitative requirements, and monitoring obligations
- Create `rules.json` with id, title, text, section, type for each requirement
- Create `rules.rich.json` with logic, notes, refs, stable_id, summary, when fields
- Target: 25-40 rules covering the full VM0007 methodology
- Treat the current retained rule artifacts as draft seeds only until they are source-audited and any external dependencies are separately encoded or explicitly left external
- Normalize retained draft rules to the `review_contract_v1` field shape so missing source spans, rule detail, and expected evidence remain explicit during audit

Acceptance:
- `rules.json` has 25+ rules
- Every rule maps to a section
- Rules cover: applicability, baseline, additionality, leakage, carbon accounting, monitoring, uncertainty
- `rules.rich.json` has enriched logic and refs for each rule
- VM0007 rule artifacts are not treated as methodology-linked review ready until metadata no longer marks them as draft/unverified

### VF4 — Handle Verra tool/module dependencies

Objective: track the Verra-specific tools, modules, and dependency references needed to support VM0007 and later Verra forestry methods.

Scope:
- Identify Verra forestry tool/module references used by VM0007
- Preserve canonical references and hashes in META.json and related manifests
- Keep repository boundaries explicit: methodology artefacts live here, app consumption lives downstream

Acceptance:
- Verra tool/module references are auditable and stable
- No app.article6 implementation details are added to this repo

### VF5 — Expand to modern Verra forestry methods

Objective: leave a roadmap slot for later Verra forestry methods after VM0007.

Scope:
- Add follow-on support for methods such as VM0047 and VM0048 after VM0007 is proven
- Reuse the same deterministic source, section, and rule contracts
- Keep VM0007 as the first Verra forestry proof target, not the entire strategy

Acceptance:
- The roadmap clearly leaves room for VM0047 and VM0048
- No phase claims completed Verra support before artifacts are encoded

### VF6 — Downstream app.article6 consumption

Objective: define the downstream consumer milestone without moving app implementation work into this repo.

Scope:
- Describe app.article6 as the consumer of encoded methodology artefacts
- Keep this milestone limited to consuming encoded Verra artefacts after they exist
- Avoid UI, workflow, or repository ownership details for app.article6

Acceptance:
- Repo boundary wording is explicit
- Verra appears in app.article6 only after methodology artefacts are encoded and consumed downstream

## Delivery constraints

- Do not build app UI here
- Do not change the rule schema; use existing contracts
- Do not break existing UNFCCC method packs
- All generation must be deterministic and CI-safe

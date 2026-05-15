# Standard-Specific Export Metadata

Status sourced from `docs/roadmaps/standard-specific-export-metadata/phase-status.json`; docs must not drift.

**Ownership boundary**: `article6-methodologies` defines and owns standard-specific semantics. `app.article6` is a pure downstream consumer — it must not invent report structures, section taxonomies, or evidence categories. This roadmap creates the upstream export metadata contract that enables standard-specific composers in the app.

## Why this matters

The app currently generates generic compliance outputs. Verra and Gold Standard each define their own report structure, required sections, evidence expectations, and disclaimer conventions. Without canonical metadata from the methodologies repo, the app must either hardcode standard-specific logic (fragile, duplicated) or produce generic outputs that neither standard accepts. This roadmap establishes the upstream contract so downstream composers stay thin and replaceable.

## What this roadmap delivers

By the end of this roadmap, the methodologies repo exposes, per standard:

| Artifact | Purpose |
|---|---|
| **Standard-specific section taxonomy** | Which sections a compliant report must include for a given standard (e.g., Verra VCS requires `4.3` baseline, `4.4` additionality; Gold Standard has its own hierarchy). |
| **Required export sections per standard** | The subset of sections that must appear in any export/report for that standard. |
| **Methodology section references** | Mapping from methodology sections (`methodologies/<standard>/<method>/<version>/sections.json`) to standard-level export section IDs. |
| **Expected evidence categories** | Canonical evidence types each standard requires (e.g., Verra: `baseline_reassessment`, `carbon_pool_measurement`; GS: `stakeholder_consultation`, `safeguards_monitoring`). |
| **Safe disclaimer language** | Standard-mandated disclaimer boilerplate for exports (e.g., "This document does not constitute a verification opinion..."). |
| **Machine-readable fields** | JSON schema consumed by `app.article6` to render composer forms, evidence pickers, and export templates without hardcoded logic. |

## Scope for this roadmap

- Define the export metadata schema and per-standard instance files in `methodologies/<standard>/_export/`.
- Cover Verra VCS (first) and Gold Standard (second); leave room for additional standards.
- Make every field machine-readable: no freeform text in the contract — only structured JSON consumed by the app.
- Treat `app.article6` as a downstream consumer only; do not place UI, composer, or export implementation work in this repo.
- Preserve deterministic generation, auditability, and pack publishing guarantees.
- Do not change existing methodology artifacts (`sections.json`, `rules.json`, `rules.rich.json`, etc.) unless the contract is reviewed and approved.

## Non-goals

- Building export composers or report renderers (belongs in `app.article6`).
- Inventing section taxonomies that contradict the standard's own published requirements.
- Adding per-project data, review state, or user content.

## Phases

### SEM-S1 — Verra export metadata contract

Objective: Define and publish the Verra VCS export metadata contract.

Scope:
- Research Verra VCS reporting requirements (VCS Standard, program guide, validation/verification report templates).
- Define the Verra-specific section taxonomy (the sections a VCS report must contain).
- Define required export sections — the subset guaranteed to appear in every VCS export.
- Map existing methodology sections (`methodologies/Verra/AFOLU/VM0007/v1-8/sections.json`, `VM0047/v1-0/sections.json`) to Verra section IDs.
- Define canonical expected evidence categories for Verra (baseline, additionality, leakage, carbon pools, monitoring, etc.).
- Publish safe disclaimer language for Verra VCS exports.
- Release as `methodologies/Verra/_export/export-metadata.json`.

Acceptance:
- `methodologies/Verra/_export/export-metadata.json` exists with versioned schema.
- Every Verra methodology references its standard taxonomy via `META.export`.
- Schema validates via CI.
- App can fetch and render composer fields without hardcoded Verra logic.

### SEM-S2 — Gold Standard export metadata contract

Objective: Define and publish the Gold Standard export metadata contract.

Scope:
- Research Gold Standard reporting requirements (GS4GG principles, safeguards, certification cycle).
- Define Gold Standard-specific section taxonomy.
- Define required export sections.
- Map existing methodology sections to GS section IDs where applicable.
- Define canonical expected evidence categories for Gold Standard (stakeholder consultation, sustainable development, safeguards monitoring, etc.).
- Publish safe disclaimer language for Gold Standard exports.
- Release as `methodologies/GoldStandard/_export/export-metadata.json`.

Acceptance:
- `methodologies/GoldStandard/_export/export-metadata.json` exists with versioned schema.
- Schema validates via CI.
- App can render both Verra and Gold Standard composers from metadata alone.

### SEM-S3 — Shared export metadata schema

Objective: Lock the cross-standard export metadata schema that both (and future) standard instances conform to.

Scope:
- Extract the common shape from SEM-S1 and SEM-S2 into a shared JSON Schema.
- Add `standard`, `version`, `sections`, `required_export_sections`, `evidence_categories`, `disclaimers`, `section_mappings` as top-level keys.
- Publish schema in `schemas/export-metadata.schema.json`.
- Validate both Verra and Gold Standard instances against it in CI.
- Do not change Verra or GS instances unless the schema requires it.

Acceptance:
- `schemas/export-metadata.schema.json` validates both standard instances.
- CI runs schema validation on every PR that touches export metadata.

### SEM-S4 — Machine-readable app consumption contract

Objective: Define the exact JSON fields `app.article6` reads to render composers, evidence pickers, and export templates.

Scope:
- Document the app-facing contract (fields, types, optionality) in `docs/roadmaps/standard-specific-export-metadata/app-consumption-contract.md`.
- Pin the contract version so app can assert feature detection.
- Ensure every field needed by the app has a corresponding source in the metadata instance.
- Add `META.export.metadata_version` to each Verra/GS methodology referencing the contract version.

Acceptance:
- `app-consumption-contract.md` documents every field with type, example, and whether the app must or may use it.
- No field in the contract lacks a corresponding instance value for Verra and GS.
- CI validates that declared `metadata_version` matches the contract.

### SEM-S5 — Integrate with methodology pack

Objective: Ensure export metadata is included in published methodology packs so the app can fetch it from the pinned release.

Scope:
- Verify `scripts/pack-methodologies.sh` picks up `_export/` directories (rsync includes `**/_export/*`).
- If not, add the include pattern without breaking existing pack contents.
- Add `_export/` to any new-methodology checklist or encoding playbook.
- Publish a new pack and verify export metadata is present in the tarball.

Acceptance:
- `methodologies-pack-<sha12>.tar.gz` contains `methodologies-pack/methodologies/Verra/_export/export-metadata.json`.
- App CI can download the pack and read export metadata without additional config.

## Delivery constraints

- Do not build app UI, composers, or export renderers here.
- Do not change existing methodology artifacts (`sections.json`, `rules.json`, `rules.rich.json`) unless explicitly reviewed.
- Do not invent standard requirements that contradict published standard documentation.
- All export metadata must be deterministic, CI-safe, and pack-included.
- Ownership boundary is strict: methodologies repo defines semantics; app repo consumes them.

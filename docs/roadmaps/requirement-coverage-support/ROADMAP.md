# Requirement Coverage Support Roadmap

## Goal

Make canonical methodology outputs rich enough to support requirement-to-evidence reconciliation in `app.article6` without pushing source-quality gaps into the app layer.

## Scope for this roadmap

- Evolve rich methodology outputs so app consumers can render requirement summaries, logic, provenance, and linked context without depending on ad hoc transforms.
- Make section, page, and anchor linkage stable enough for app navigation and reconciliation workflows.
- Preserve deterministic generation, auditability, and existing ingest and pack publishing guarantees.

## Layering rules

- `rules.json` and `sections.json` stay relatively thin for retrieval, indexing, and lightweight consumers.
- New requirement-coverage metadata lands in `rules.rich.json` and `sections.rich.json` first unless a lean consumer explicitly requires it.
- Lean and rich artifacts are separate contracts with different purposes.
- Do not bloat lean artifacts to satisfy app rendering needs when rich artifacts are the correct layer.

## Phases

### RC-S1 — Rich schema foundation

- Make schema evolution additive and backward-compatible where possible, with changes focused on rich outputs rather than a full canonical rewrite.
- Add explicit rich-schema space for richer rule display fields, requirement class or modality markers where feasible, conditions, and stronger section linkage or locator carry-through.
- Preserve stable IDs and reserve stable placeholders for expected-evidence hints so later phases can build on consistent rich output contracts.

### RC-S2 — Richer rule detail

- Populate the additive rich-schema fields with materially better rule summaries, display text, logic, conditions, and methodology context.
- Carry requirement class, modality, and conditions where feasible from canonical sources without inventing unsupported structure.
- Keep lean outputs stable for existing consumers while improving the richness of app-facing rule rendering data.

### RC-S3 — Stable section/page/anchor linkage

- Normalize stable section identifiers, anchors, and locator carry-through in rich outputs.
- Attach page, section lineage, and anchor metadata where provenance exists, without fabricating navigation hints.
- Ensure rule-to-section cross-links are stable enough for requirement reconciliation and audit review.

### RC-S4 — Methodology tool/module relationships

- Expose clearer rule-to-tool, methodology-to-tool, and methodology-to-module relationships from canonical artifacts.
- Keep `META.references.tools` as the auditable source of truth for tool artifacts and hashes.
- Preserve provenance so relationship enrichment remains reviewable and compatible with strict gates.

### RC-S5 — Version relationship + diff support

- Add explicit version lineage metadata for methodology families.
- Make previous and next version relationships available for app navigation and future diff workflows.
- Keep diff-oriented metadata additive so version support can land before any heavier comparison tooling.

### RC-S6 — Optional expected-evidence metadata support

- Use the stable placeholders introduced in RC-S1 for optional expected-evidence hints.
- Keep this provenance-safe and optional so the app can adopt richer requirement-to-evidence guidance incrementally.
- Do not introduce project evidence ingestion in this repo as part of this phase.

### RC-S7 — Ingestion automation hardening later

- Treat GitHub Issues and Projects as intake and tracking only, not as a substitute for the execution pipeline.
- Keep `ingest.sh`, CI, and workflows as the execution layer, phased in later only when schema and output contracts are stable enough to support automation safely.
- Any automation hardening must remain scoped, reviewable, and friendly to strict repository gates rather than becoming a broad first move.

### RC-S8 — Lock rich-rule v1 contract

- Lock the rich-rule v1 baseline contract to `summary`, `logic`, `notes`, `when`, `refs`, and `requirement_coverage.expected_evidence` where grounded.
- Treat duplicate or empty `display.*` fields as out of contract for the baseline and do not reintroduce cleanup churn around them.
- Future methodology work in this area should be additive enrichment only, not another round of field-shape cleanup.
- Additive enrichment examples include provenance excerpts, failure modes, review questions, and broader `expected_evidence` coverage where grounded.

## Delivery constraints

- Do not build app UI here.
- Do not add project evidence ingestion here.
- Do not redesign unrelated methodology outputs outside the requirement-coverage use case.

## Current PR

- Seed this roadmap and status tracker.
- Land additive rich-schema and canonical output improvements that keep the roadmap schema-first and gate-safe.
- Keep existing validation, ingest, and pack-related flows green.

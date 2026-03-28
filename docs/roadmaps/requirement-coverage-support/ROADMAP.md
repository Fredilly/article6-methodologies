# Requirement Coverage Support Roadmap

## Goal

Make canonical methodology outputs rich enough to support requirement-to-evidence reconciliation in `app.article6` without pushing source-quality gaps into the app layer.

## Scope for this roadmap

- Enrich rule outputs so app consumers can render requirement summaries, logic, provenance, and linked context.
- Make section, page, and anchor linkage stable enough for app navigation and reconciliation workflows.
- Preserve deterministic generation, auditability, and existing ingest and pack publishing guarantees.

## Phases

### 1. Richer rule detail

- Add app-facing rule display fields that preserve canonical summary, logic, conditions, and tool references.
- Keep lean outputs backward-compatible while exposing materially better renderable metadata.
- Preserve deterministic IDs so requirement coverage state can link to canonical rule records.

### 2. Stable section/page/anchor linkage

- Normalize section anchors and stable section identifiers.
- Carry section lineage and anchor metadata into app-facing outputs.
- Attach page and locator metadata where source anchors exist, without inventing provenance.

### 3. Methodology tool/module relationships

- Expose clearer rule-to-tool and methodology-to-tool relationships from canonical artifacts.
- Keep `META.references.tools` as the auditable source of truth for tool artifacts and hashes.

### 4. Version relationship + diff support

- Add explicit version lineage metadata for methodology families.
- Make previous and next version relationships available for app navigation and future diff workflows.

### 5. Optional expected-evidence metadata support

- Reserve a stable place for future expected-evidence hints without requiring project-evidence ingestion in this repo.
- Keep this optional and provenance-safe so the app can adopt it incrementally.

## Delivery constraints

- Do not build app UI here.
- Do not add project evidence ingestion here.
- Do not redesign unrelated methodology outputs outside the requirement-coverage use case.

## Current PR

- Seed this roadmap and status tracker.
- Enrich canonical methodology outputs with stable IDs, richer rule display fields, deeper section linkage, optional locator/page carry-through, and version relationships.
- Keep existing validation, ingest, and pack-related flows green.

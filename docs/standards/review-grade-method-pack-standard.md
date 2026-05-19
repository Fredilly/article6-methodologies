# Review-Grade Method Pack Standard

A Review-Grade methodology pack is one that meets all Source-Audited requirements **and** exposes complete, machine-readable expected evidence metadata for every rule.

Review-Grade is the formal superset of Source-Audited. Every Review-Grade method is also Source-Audited; not every Source-Audited method is Review-Grade.

The app displays a `Review-Grade` badge for methodology packs meeting this standard and uses the evidence metadata to drive evidence pickers, review panels, and export composers.

## Requirements

### Source-Audited baseline

A Review-Grade method must meet every requirement of the Source-Audited Methodology Standard:
- Source PDF verified
- All sections source-audited
- All rules source-audited (no `draft_unverified`, no active blockers)
- `methodology_linked_review_ready: true`

### Expected evidence completeness

Every rule in the method pack must have `requirement_coverage.expected_evidence` populated:

- `expected_evidence[]` is non-empty for every rule
- Each entry references a valid `evidence_type_id` from the published evidence taxonomy
- Each entry has a non-empty `evidence_kind` (`mandatory`, `optional`, `conditional`)
- `conditional` entries include a machine-readable `evidence_condition`
- Each entry has a non-empty `description` string (no placeholder text)

### Evidence taxonomy conformance

- All `evidence_type_id` values resolve to entries in `docs/standards/expected-evidence-taxonomy.md`
- No custom or invented evidence types outside the taxonomy
- Taxonomy extensions must follow the extension protocol (new type added to taxonomy before being referenced)

### Requirement kind completeness

Every rule must have `requirement_kind` populated:
- `human-judgment-required` — rule requires reviewer expertise (e.g., additionality论证)
- `calculable` — rule can be verified via calculation workbook fields
- `document-check` — rule is satisfied by document presence (e.g., monitoring plan exists)

### Metadata (META.json)

- `artifact_quality_standard.adoption_status: "review_grade"`
- `artifact_quality_standard.version: "review_contract_v2"` (or later)
- `methodology_linked_review_ready: true`
- All Source-Audited META fields present and truthful
- `export.evidence_intelligence_version` matches the app consumption contract version

### Determinism

- Same input source → same expected_evidence output (bytes-identical)
- Evidence metadata is generated deterministically from methodology rules and source spans
- No random, date-stamped, or reviewer-dependent evidence entries

### CI verification gates

CI must verify that Review-Grade methods satisfy all of the above. A failing gate demotes the method to `not_grade_a` (Source-Audited baseline) until resolved.

## Compatibility

| Public standard | Internal machine value | Superset of |
|----------------|------------------------|-------------|
| Review-Grade | `adoption_status: "review_grade"` | Source-Audited |
| Source-Audited | `adoption_status: "grade_a"` | — |
| Not Source-Audited | `adoption_status: "not_grade_a"` | — |

The `review_grade` value is new. Existing Source-Audited methods retain `grade_a` until promoted.

## Transition path

A Source-Audited method reaches Review-Grade by:
1. Populating `requirement_coverage.expected_evidence` for every rule using the published taxonomy
2. Setting `requirement_kind` for every rule
3. Updating `META.artifact_quality_standard.adoption_status` to `"review_grade"`
4. Adding `META.export.evidence_intelligence_version`
5. Passing all Review-Grade CI gates

## Verification

```bash
node scripts/check-method-grade.js methodologies/<Standard>/<Program>/<Code>/<version>
```

The validator checks:
- Source-Audited baseline pass
- Every rule has non-empty `expected_evidence[]`
- All `evidence_type_id` values resolve in the taxonomy
- All `requirement_kind` values are valid
- META.json adoption_status matches actual state
- CI gate results

## Scope

This standard defines methodology pack quality only. It does not imply:
- VVB approval, certification, validation, or verification
- Carbon credit quality or eligibility
- Regulatory or programmatic endorsement
- Evidence sufficiency (whether the expected evidence is sufficient for a real review)

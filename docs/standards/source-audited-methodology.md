# Source-Audited Methodology Standard

A Source-Audited methodology is one where:
- The source PDF is verified
- All encoded sections and rules are backed by source page spans
- No rules remain `draft_unverified`
- No active external dependency blockers remain

This is the publicly facing methodology quality standard. The app displays a
`Source-Audited` badge for methodologies meeting this standard.

## Requirements

### Source PDF
- `artifact_status.source_pdf === "verified"`

### Sections
- `artifact_status.sections === "source_audited"`
- All sections source-audited (`locator_status: "source_audited"`).
- Page ranges verified from source PDF TOC.
- Hierarchy (`section_level`, `parent_id`) correctly mapped.

### Rules
- `artifact_status.rules === "source_audited"`
- All rules source-audited (`quality_status: "source_audited"`).
- No `draft_unverified` rules.
- No active blocked external dependencies (`blocked_rule_count` must be
  0, or the blocked inventory must be absent with an explicit clean
  state).
- Every source-audited rule must have:
  - `quality_status: "source_audited"`
  - `source_span_status: "source_audited"`
  - `rule_detail.status: "source_audited"`
  - source-backed `conditions` (minimum 1)
  - no placeholder exception text
    (rejects "Not specified", "TBD", "pending", "unknown")
  - no invented conditions or exceptions not supported by the source span

### Metadata (META.json)
- `methodology_linked_review_ready: true`
- `artifact_quality_standard.adoption_status: "grade_a"`
  (see Compatibility note below)
- Truthful counts (sections, rules, source_audited rules,
  draft_unverified rules)
- Current audit hashes matching artifact files
- No stale blocker wording
- External dependencies either encoded or explicitly resolved

### App contract
- Method listing: method appears in method list
- Section browsing: sections are navigable
- Rule browsing: rules are navigable with source spans and page locators
- Methodology-linked review: review can be started without hidden caveats
- Export: complete without unverified or placeholder sections/rules

## Compatibility

The `Source-Audited Methodology Standard` supersedes the earlier internal
`Method Grade A Standard`. The machine value
`artifact_quality_standard.adoption_status: "grade_a"` is a legacy/internal
alias for a methodology that meets the Source-Audited standard. New code
should reference `Source-Audited` in public-facing interfaces while
preserving `grade_a` for machine-to-machine compatibility.

| Public standard | Internal machine value |
|----------------|------------------------|
| Source-Audited | `adoption_status: "grade_a"` |
| Not Source-Audited | `adoption_status: "not_grade_a"` |

## Transition path

A method reaches the Source-Audited standard by:
1. Encoding external dependencies as local artifacts
2. Promoting all remaining `draft_unverified` rules to `source_audited`
3. Setting `methodology_linked_review_ready: true` only when all
   blockers are resolved

## Verification

```bash
node scripts/grade-method.js methodologies/Verra/AFOLU/VM0047/v1-0
```

The validator checks META, sections, rules, rich rules, and blocker
inventory.

## VM0047 reference pattern

VM0047 v1.0 is the first Verra method to meet the Source-Audited standard
and serves as the reference template for all future Verra forestry methods.

### Artifact shape

| Artifact | Convention |
|----------|------------|
| `META.json` | `adoption_status: grade_a`, `rules: source_audited`, `methodology_linked_review_ready: true` |
| `sections.json` | All sections `locator_status: source_audited` with verified page ranges |
| `rules.json` | All `quality_status: source_audited`, no external deps in `tools` |
| `rules.rich.json` | Every rule has `source_span_status`, `rule_detail.status: source_audited`, non-empty `source_span_text`, ≥1 condition, no placeholder exceptions |
| `blocked-external-dependencies.json` | `blocked_rule_count: 0`, `status: no_active_blockers` |

### External reference classification

External dependencies in `META.json.external_dependencies.methodology_and_tool_refs`
must be classified as:

| Status | Meaning | Source-Audited impact |
|--------|---------|----------------------|
| `external_unencoded` | Active blocker. Rule depends on this doc. | Blocks Source-Audited |
| `historical_non_blocking` | Referenced by SOURCES section but methodology is self-contained. | Does not block Source-Audited |

A reference is `historical_non_blocking` only when:
- The methodology text is self-contained for all rules referencing it
- The reference appears only in SOURCES or as background context
- No rule's `tools` array includes it

### Applying to new methods

1. Source-audit all sections from PDF TOC (follow VF2 pattern).
2. Source-audit all rules (follow VF3 pattern).
3. For rules referencing external docs, verify whether the methodology
   is self-contained. If not, keep as `draft_unverified` with
   `external_unencoded` dependency status.
4. Only mark `methodology_linked_review_ready: true` when every rule
   is source-backed and no `external_unencoded` deps remain.
5. Do not copy VM0047's self-contained assumptions into methods that
   genuinely depend on unencoded modules or tools.

## Scope

This standard defines methodology artifact quality only. It does not imply:
- VVB approval, certification, validation, or verification
- Carbon credit quality or eligibility
- Regulatory or programmatic endorsement

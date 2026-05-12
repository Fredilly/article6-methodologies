# Method Grade A Standard

Grade A is the minimum quality bar for a methodology to be treated as
a first-class app-ready method in article6 methodology-linked review.

## Requirements

### Sections
- All sections source-audited (`locator_status: "source_audited"`).
- Page ranges verified from source PDF TOC.
- Hierarchy (section_level, parent_id) correctly mapped.

### Rules
- All rules source-audited (`quality_status: "source_audited"`).
- No `draft_unverified` rules.
- No active blocked external dependencies (`blocked_rule_count` must be
  0, or the blocked inventory must be absent with an explicit clean
  state).
- Every source-audited rule must have:
  - `quality_status: "source_audited"`
  - `source_span_status: "source_audited"`
  - `rule_detail.status: "source_audited"`
  - source-backed `conditions` (min 1)
  - no placeholder exception text
    (rejects "Not specified", "TBD", "pending", "unknown")
  - no invented conditions or exceptions not supported by the source
    span

### Metadata (META.json)
- `methodology_linked_review_ready: true`
- `artifact_status.rules: "source_audited"`
- `artifact_quality_standard.adoption_status: "grade_a"`
- Truthful counts (sections, rules, source_audited rules,
  draft_unverified rules)
- Current audit hashes matching artifact files
- No stale blocker wording
- External dependencies either encoded or explicitly resolved

### App contract
- Method listing: method appears in method list
- Section browsing: sections are navigable
- Rule browsing: rules are navigable with source spans and page
  locators
- Methodology-linked review: review can be started without hidden
  caveats
- Export: complete without unverified or placeholder sections/rules

## Grade outcomes

| Grade | Meaning |
|-------|---------|
| `grade_a` | Meets all requirements. App-ready. |
| `not_grade_a` | One or more requirements not met. Not app-ready. |

## Transition path

A method reaches Grade A by:
1. Encoding external dependencies as local artifacts
2. Promoting all remaining `draft_unverified` rules to `source_audited`
3. Setting `methodology_linked_review_ready: true` only when all
   blockers are resolved

## VM0047 reference pattern

VM0047 v1.0 is the first Verra method to reach Grade A and serves as
the reference template for all future Verra forestry methods.

### Artifact shape

| Artifact | Convention |
|----------|------------|
| `META.json` | `adoption_status: grade_a`, `rules: source_audited`, `methodology_linked_review_ready: true` |
| `sections.json` | All sections `locator_status: source_audited` with verified page ranges |
| `rules.json` | All 58 rules `quality_status: source_audited`, no external deps in `tools` |
| `rules.rich.json` | Every rule has `source_span_status`, `rule_detail.status: source_audited`, non-empty `source_span_text`, >=1 condition, no placeholder exceptions |
| `blocked-external-dependencies.json` | `blocked_rule_count: 0`, `status: no_active_blockers` |
| `METHOD_GRADE.json` | Not used. Grade A is computed from canonical artifacts via `scripts/grade-method.js`. |

### External reference classification

External dependencies in `META.json.external_dependencies.methodology_and_tool_refs`
must be classified as:

| Status | Meaning | Grade A impact |
|--------|---------|----------------|
| `external_unencoded` | Active blocker. Rule depends on this doc. | Blocks Grade A. |
| `historical_non_blocking` | Referenced by SOURCES section but methodology is self-contained. | Does not block Grade A. |

A reference is `historical_non_blocking` only when:
- The methodology text is self-contained for all rules referencing it
- The reference appears only in SOURCES or as background context
- No rule's `tools` array includes it

### Verifying Grade A

```bash
node scripts/grade-method.js methodologies/Verra/AFOLU/VM0047/v1-0
```

The validator checks META, sections, rules, rich rules, and blocker
inventory. It does not require a separate METHOD_GRADE.json.

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

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

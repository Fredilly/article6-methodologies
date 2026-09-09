# Governance-v1 section content and source resolution

This file closes a governance gap discovered after VM0047 v1.1 promotion.

## Principle

A section or atomic rule is not source-audited merely because it names a section, page, or source hash.

For governance-v1 states `PROVENANCE_COMPLETE`, `RETRIEVAL_TESTED`, and `VERIFIED`, source evidence must be mechanically resolvable to repository-governed extracted source text.

The governed PDF remains the authoritative source artifact. Extracted text is a deterministic retrieval aid tied to that governed source and must never replace the PDF as authority.

## Section invariant

Every `sections.rich.json` record with `source_span_status: source_audited` must provide:

- `provenance.source_hash` equal to the component's governed source PDF SHA-256;
- one or more `provenance.lines` entries using the canonical form `repo/path/to/source.txt#L<start>-L<end>`;
- one or more `locators` containing exact source text in `quote`;
- a line range that resolves to substantive section content and contains every quoted locator.

A heading, page number, or section number alone is not section content.

## Rule invariant

Every `rules.rich.json` record with `source_span_status: source_audited` must provide:

- `provenance.source_hash` equal to the component's governed source PDF SHA-256;
- one or more `refs.lines` entries using the same canonical line-reference form;
- one or more `refs.locators` containing exact source evidence in `quote`;
- `source_span_text` that occurs inside the resolved governed-text span.

`logic` is Article6's normalized atomic rule. `source_span_text` is source evidence. They may be textually identical only where the source itself is identical to the normalized rule; equality is never sufficient evidence by itself.

## Promotion invariant

A component must not enter or retain `PROVENANCE_COMPLETE`, `RETRIEVAL_TESTED`, or `VERIFIED` if the section/rule source-resolution invariant fails.

Retrieval testing for `VERIFIED` must prove that:

1. section retrieval returns or resolves substantive governed section content, not only metadata;
2. rule retrieval returns the normalized rule and its exact source evidence;
3. source evidence resolves to the governed text span and governed PDF hash;
4. failure to resolve source evidence is explicit and blocks verified output.

## Implementation

`scripts/check-governance-source-resolution.js` implements the mechanical source-resolution check.

The validator is introduced before corpus remediation. CI enforcement is activated once the currently promoted governance-v1 component has been remediated, so the guardrail cannot be bypassed by future methodology ingestion or promotion.

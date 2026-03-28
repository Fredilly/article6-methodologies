# RC-S3 Linkage Contract

- `sections.rich.json` owns locator truth.
- `rules.rich.json.refs` carries the canonical section linkage identifiers.
- `rules.rich.json.section_context` is an app-facing convenience mirror, not an independent source of truth.
- `stable_id` is the globally unique cross-method key.
- `anchor`, `page_start`, and `page_end` are optional and must be omitted when not grounded.
- Differing coverage across methodologies is acceptable; differing field semantics are not.

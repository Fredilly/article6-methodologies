# App Consumption Contract — Standard-Specific Export Metadata

**Contract version**: `1.0.0`

**Ownership**: `article6-methodologies` defines. `app.article6` consumes.

The app reads export metadata from `methodologies/<Standard>/_export/export-metadata.json`.
Each active methodology's `META.json` carries an `export` field linking to the relevant
standard's metadata instance.

## Fields consumed by app.article6

| Field | Type | Required | Purpose |
|---|---|---|---|
| `standard` | string | required | Standard name used for routing to the correct composer. Enum: `Verra`, `Gold Standard`. |
| `metadata_version` | string (semver) | required | Semantic version of the metadata contract. App MUST assert `>= min_version`. |
| `section_taxonomy[].id` | string | required | Stable identifier for the export section. Used as key in `required_export_sections` and `section_mappings[].export_section_id`. |
| `section_taxonomy[].title` | string | required | Human-readable section heading. Rendered as a composer section header. |
| `section_taxonomy[].description` | string | required | Description displayed as tooltip or help text in the composer. |
| `section_taxonomy[].required` | boolean | required | Whether the section MUST appear in every export for this standard. |
| `section_taxonomy[].export_order` | integer | required | Display order in the composer UI (1-based). |
| `section_taxonomy[].parent_id` | string or null | optional | Parent section id for hierarchical taxonomy. null for top-level. |
| `section_taxonomy[].evidence_categories` | string[] | required | Evidence category keys relevant to this section. Used to populate the evidence picker. |
| `required_export_sections` | string[] | required | Subset of section_taxonomy[].id that MUST appear in every compliant export. |
| `evidence_categories` | object | required | Map of evidence category key → { title, description, section_ids }. Populates evidence picker UI. |
| `evidence_categories.*.title` | string | required | Display name for evidence type. |
| `evidence_categories.*.description` | string | required | Detailed description shown as evidence picker tooltip. |
| `evidence_categories.*.section_ids` | string[] | optional | Which sections typically require this evidence type. |
| `section_mappings[].methodology` | string | required when present | Methodology code (e.g., `VM0007`). |
| `section_mappings[].version` | string | required when present | Methodology version (e.g., `v1-8`). |
| `section_mappings[].mappings[]` | object[] | required when present | Array of { methodology_section_id → export_section_id } mappings. |
| `disclaimers.readiness` | string | required | Disclaimer for readiness-stage reports. MUST be rendered verbatim. |
| `disclaimers.validation` | string | optional | Disclaimer for validation-stage drafts. |
| `disclaimers.verification` | string | optional | Disclaimer for verification-stage reports. |

## How the app should consume

1. **Load**: Fetch `methodologies/<Standard>/_export/export-metadata.json` on app init or per-standard.
2. **Assert version**: Check `metadata_version >= app_min_version`. Reject or warn if unsupported.
3. **Build composer**: Render one section per `section_taxonomy` entry, in `export_order`. Mark required sections.
4. **Filter sections**: Only show sections applicable to the project's methodology (via `section_mappings`).
5. **Evidence picker**: Populate evidence options from `evidence_categories`. Filter by `section_ids` where applicable.
6. **Render disclaimers**: Show `readiness` disclaimer for draft/readiness exports. Show `validation`/`verification` for respective stages.
7. **Validate completeness**: Before export, verify all `required_export_sections` have content.

## Version compatibility

| Contract version | Minimum app version | Changes |
|---|---|---|
| 1.0.0 | 1.0.0 | Initial release — Verra and Gold Standard metadata |

## App responsibility

- The app MUST NOT invent section names, evidence categories, or disclaimer language.
- The app MUST render disclaimers verbatim as specified in the metadata.
- The app MUST validate `metadata_version` before processing.

## Methodology repo responsibility

- Every active methodology META.json includes an `export` field pointing to the correct standard metadata.
- Metadata instances are validated against the shared JSON Schema in CI.
- Section mappings reference only existing methodology section IDs.

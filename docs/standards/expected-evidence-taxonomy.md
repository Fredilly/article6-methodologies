# Expected Evidence Taxonomy

This document defines the canonical taxonomy of evidence types that methodology rules can reference in `requirement_coverage.expected_evidence`. Every `evidence_type_id` used in a Review-Grade method pack must resolve to an entry defined here.

## Taxonomy structure

The taxonomy is a flat list of evidence type entries, each with:
- `id`: machine-readable identifier (e.g., `monitoring_report`)
- `display_name`: human-readable label (e.g., "Monitoring Report")
- `category`: top-level grouping
- `description`: what this evidence type covers
- `formats`: acceptable file formats
- `usage_notes`: when to use this type vs. related types

## Categories

| Category | Description |
|----------|-------------|
| `document` | Written reports, plans, assessments, and declarations |
| `geospatial` | Maps, satellite imagery, GIS data, boundary files |
| `calculation` | Spreadsheets, formula workbooks, emissions/removals calculations |
| `measurement` | Field measurements, sampling data, sensor readings |
| `attestation` | Third-party statements, signatures, verification opinions |

## Evidence types

### document.monitoring_report

| Field | Value |
|-------|-------|
| `id` | `monitoring_report` |
| `display_name` | Monitoring Report |
| `category` | `document` |
| `description` | Periodic report describing project implementation, monitoring activities, and results against the monitoring plan |
| `formats` | `pdf`, `docx` |
| `usage_notes` | Use for rules requiring evidence of ongoing monitoring activities. Distinguish from `monitoring_plan` which is the plan document itself. |

### document.monitoring_plan

| Field | Value |
|-------|-------|
| `id` | `monitoring_plan` |
| `display_name` | Monitoring Plan |
| `category` | `document` |
| `description` | The approved plan describing monitoring frequency, parameters, and methods |
| `formats` | `pdf`, `docx` |
| `usage_notes` | Use for rules requiring the monitoring methodology or plan document. Distinguish from `monitoring_report` which describes actual monitoring results. |

### document.project_design_document

| Field | Value |
|-------|-------|
| `id` | `pdd` |
| `display_name` | Project Design Document (PDD) |
| `category` | `document` |
| `description` | The project design document describing project activities, baseline, additionality, and monitoring approach |
| `formats` | `pdf`, `docx` |
| `usage_notes` | Use for rules referencing PDD sections, project description, or baseline determination. |

### document.project_description

| Field | Value |
|-------|-------|
| `id` | `project_description` |
| `display_name` | Project Description |
| `category` | `document` |
| `description` | Narrative description of the project, its location, technology, and activities |
| `formats` | `pdf`, `docx` |
| `usage_notes` | Use for rules specifically about project description content (distinct from PDD which is a broader document). |

### document.baseline_report

| Field | Value |
|-------|-------|
| `id` | `baseline_report` |
| `display_name` | Baseline Report |
| `category` | `document` |
| `description` | Report documenting baseline emissions, baseline scenario, and baseline determination methodology |
| `formats` | `pdf`, `xlsx`, `docx` |
| `usage_notes` | Use for rules requiring baseline emissions evidence. May be part of PDD or a standalone document. |

### document.additionality_assessment

| Field | Value |
|-------|-------|
| `id` | `additionality_assessment` |
| `display_name` | Additionality Assessment |
| `category` | `document` |
| `description` | Evidence demonstrating the project is additional (investment analysis, barrier analysis, common practice analysis) |
| `formats` | `pdf`, `xlsx`, `docx` |
| `usage_notes` | Use for additionality rules. Typically includes investment analysis spreadsheets and barrier analysis documentation. |

### document.leakage_assessment

| Field | Value |
|-------|-------|
| `id` | `leakage_assessment` |
| `display_name` | Leakage Assessment |
| `category` | `document` |
| `description` | Analysis of potential leakage emissions outside the project boundary |
| `formats` | `pdf`, `xlsx` |
| `usage_notes` | Use for leakage quantification and prevention rules. |

### document.emissions_reductions_calculation

| Field | Value |
|-------|-------|
| `id` | `emissions_reductions_calculation` |
| `display_name` | Emissions Reductions Calculation |
| `category` | `document` |
| `description` | Workbook or report showing ex-post emissions reductions or net GHG removals |
| `formats` | `xlsx`, `pdf`, `csv` |
| `usage_notes` | Use for rules requiring actual emissions reductions quantification. Distinguish from `calculation_workbook` which is a broader category. |

### document.calculation_workbook

| Field | Value |
|-------|-------|
| `id` | `calculation_workbook` |
| `display_name` | Calculation Workbook |
| `category` | `document` |
| `description` | Spreadsheet containing formulas, input parameters, and intermediate calculations for GHG estimation |
| `formats` | `xlsx`, `csv`, `numbers` |
| `usage_notes` | Use for rules requiring traceable calculation logic. Includes any structured formula workbook used for quantification. |

### document.validation_report

| Field | Value |
|-------|-------|
| `id` | `validation_report` |
| `display_name` | Validation Report |
| `category` | `document` |
| `description` | Third-party validation report confirming the project design meets applicable standards |
| `formats` | `pdf` |
| `usage_notes` | Use for rules referencing validation findings or requiring validation evidence. |

### document.verification_report

| Field | Value |
|-------|-------|
| `id` | `verification_report` |
| `display_name` | Verification Report |
| `category` | `document` |
| `description` | Third-party verification report confirming emissions reductions or removals for a reporting period |
| `formats` | `pdf` |
| `usage_notes` | Use for rules referencing verification findings or requiring verified evidence. |

### document.safeguards_report

| Field | Value |
|-------|-------|
| `id` | `safeguards_report` |
| `display_name` | Safeguards Report |
| `category` | `document` |
| `description` | Report documenting environmental and social safeguards, including stakeholder consultation and grievance mechanisms |
| `formats` | `pdf`, `docx` |
| `usage_notes` | Use for safeguards monitoring, stakeholder consultation, and sustainable development rules. Primarily relevant for Gold Standard methods. |

### document.stakeholder_consultation

| Field | Value |
|-------|-------|
| `id` | `stakeholder_consultation` |
| `display_name` | Stakeholder Consultation Records |
| `category` | `document` |
| `description` | Records of stakeholder consultations, meetings, feedback, and responses |
| `formats` | `pdf`, `docx` |
| `usage_notes` | Use for rules requiring stakeholder engagement evidence. May include meeting minutes, sign-in sheets, and feedback logs. |

### geospatial.project_boundary

| Field | Value |
|-------|-------|
| `id` | `project_boundary` |
| `display_name` | Project Boundary (GIS) |
| `category` | `geospatial` |
| `description` | Geospatial file defining the project boundary or area polygons |
| `formats` | `geojson`, `shapefile`, `kml`, `gpkg` |
| `usage_notes` | Use for rules requiring spatial definition of the project area. Must include coordinate reference system metadata. |

### geospatial.satellite_imagery

| Field | Value |
|-------|-------|
| `id` | `satellite_imagery` |
| `display_name` | Satellite Imagery |
| `category` | `geospatial` |
| `description` | Satellite or aerial imagery of the project area for land cover, biomass, or activity data estimation |
| `formats` | `geotiff`, `jp2`, `cloud-optimized-geotiff` |
| `usage_notes` | Use for rules requiring remote sensing evidence. Typically referenced via STAC catalog entries. |

### geospatial.land_cover_map

| Field | Value |
|-------|-------|
| `id` | `land_cover_map` |
| `display_name` | Land Cover / Land Use Map |
| `category` | `geospatial` |
| `description` | Classified land cover map derived from imagery or field surveys |
| `formats` | `geotiff`, `geojson` |
| `usage_notes` | Use for rules requiring land use classification or change detection evidence. |

### geospatial.sampling_plot_locations

| Field | Value |
|-------|-------|
| `id` | `sampling_plot_locations` |
| `display_name` | Sampling Plot Locations |
| `category` | `geospatial` |
| `description` | Geospatial file defining field sampling plot locations |
| `formats` | `geojson`, `shapefile`, `csv` |
| `usage_notes` | Use for rules requiring stratified sampling or field measurement plot evidence. |

### calculation.parameter_sheet

| Field | Value |
|-------|-------|
| `id` | `parameter_sheet` |
| `display_name` | Parameter Sheet |
| `category` | `calculation` |
| `description` | Structured listing of all parameters, defaults, sources, and values used in quantification |
| `formats` | `xlsx`, `csv`, `json` |
| `usage_notes` | Use for rules requiring ex-ante or ex-post parameter evidence. May be embedded in calculation workbook. |

### calculation.emissions_factor

| Field | Value |
|-------|-------|
| `id` | `emissions_factor` |
| `display_name` | Emissions Factor |
| `category` | `calculation` |
| `description` | Published or derived emissions factor with source reference and uncertainty |
| `formats` | `xlsx`, `csv`, `json` |
| `usage_notes` | Use for rules referencing specific emission or removal factors. Must include source citation. |

### measurement.field_data

| Field | Value |
|-------|-------|
| `id` | `field_data` |
| `display_name` | Field Measurement Data |
| `category` | `measurement` |
| `description` | Raw or processed field measurements including tree measurements, soil samples, biomass data |
| `formats` | `xlsx`, `csv`, `json` |
| `usage_notes` | Use for rules requiring in-situ field evidence. Must include measurement protocol and timestamp metadata. |

### measurement.forest_inventory

| Field | Value |
|-------|-------|
| `id` | `forest_inventory` |
| `display_name` | Forest Inventory Data |
| `category` | `measurement` |
| `description` | Forest inventory data including species, diameter, height, and calculated biomass |
| `formats` | `xlsx`, `csv`, `json` |
| `usage_notes` | Use for forestry-specific rules requiring plot-level inventory evidence. |

### attestation.legal_title

| Field | Value |
|-------|-------|
| `id` | `legal_title` |
| `display_name` | Legal Title / Land Tenure |
| `category` | `attestation` |
| `description` | Evidence of legal right to implement the project on the land area |
| `formats` | `pdf`, `image` |
| `usage_notes` | Use for rules requiring land tenure or legal right evidence. May include deeds, leases, or government approvals. |

### attestation.authority_approval

| Field | Value |
|-------|-------|
| `id` | `authority_approval` |
| `display_name` | Authority Approval / Permit |
| `category` | `attestation` |
| `description` | Regulatory or government approval, permit, or letter of authorization |
| `formats` | `pdf` |
| `usage_notes` | Use for rules requiring government or regulatory approval evidence. |

### attestation.certification

| Field | Value |
|-------|-------|
| `id` | `certification` |
| `display_name` | Certification Statement |
| `category` | `attestation` |
| `description` | Third-party certification, audit statement, or signed declaration |
| `formats` | `pdf` |
| `usage_notes` | Use for rules requiring signed attestation or certified statement evidence. |

## Rule type to expected evidence mapping

The following table maps rule types (from `rules.rich.json.type`) to the most common expected evidence types. This is a guideline, not a constraint — individual rules may deviate based on methodology-specific requirements.

| Rule type | Common expected evidence types |
|-----------|-------------------------------|
| `eligibility` | `pdd`, `project_description`, `project_boundary`, `legal_title`, `authority_approval`, `certification` |
| `parameter` | `parameter_sheet`, `calculation_workbook`, `emissions_factor`, `field_data`, `forest_inventory` |
| `equation` | `calculation_workbook`, `emissions_reductions_calculation`, `parameter_sheet` |
| `calc` | `calculation_workbook`, `emissions_reductions_calculation`, `parameter_sheet`, `emissions_factor` |
| `monitoring` | `monitoring_report`, `monitoring_plan`, `satellite_imagery`, `land_cover_map`, `field_data` |
| `leakage` | `leakage_assessment`, `calculation_workbook`, `project_boundary` |
| `uncertainty` | `field_data`, `forest_inventory`, `calculation_workbook`, `parameter_sheet` |
| `reporting` | `monitoring_report`, `verification_report`, `validation_report`, `safeguards_report` |

## Extension protocol

To add a new evidence type to the taxonomy:

1. Propose the new type with the same structured fields (`id`, `display_name`, `category`, `description`, `formats`, `usage_notes`)
2. Update `docs/standards/expected-evidence-taxonomy.md`
3. Update the JSON Schema in `schemas/evidence-taxonomy.schema.json`
4. Update any rules that should reference the new type
5. Update the rule type mapping table if a new rule type is introduced

New evidence types must not break existing `evidence_type_id` references. Always add; never remove or rename existing IDs without a migration path.

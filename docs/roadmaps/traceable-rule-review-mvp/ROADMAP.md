# Traceable Rule Review MVP -> VVB-Ready Roadmap

Roadmap ID: `traceable-rule-review-mvp`

Status source: `docs/roadmaps/traceable-rule-review-mvp/phase-status.json`

## Goal

Turn Article6 from a methodology/checklist demo into a methodology-aware verification workspace that produces traceable, defensible, reviewable rule-by-rule outputs for VVB-style workflows.

## Product thesis

The monetizable object is not the checklist. The monetizable object is the rule review record:

- what rule is being reviewed
- what evidence supports it
- why it was marked the way it was
- what remains unresolved
- who reviewed it, when, and from what source or provenance

## Boundary rule

The app must not invent methodology semantics ad hoc. `article6-methodologies` defines the canonical contract. `app.article6` consumes it.

## Repo ownership

### `article6-methodologies` owns

- canonical methodology content
- rule text and source anchors
- rule metadata and contracts
- evidence-type expectations per rule
- STAC eligibility flags
- manual-review requirement flags
- canonical shapes consumed by the app

### `app.article6` owns

- projects and verification workflow
- rule review UI
- rationale, support, and provenance persistence
- evidence attachment and linking
- AOI and STAC fact display
- exports and review summaries

## Rule review record definition

Each rule review record is the reviewable object the product sells and exports. The methodology repo does not store project review state, but it does define the canonical rule contract that makes the record defensible. The minimum contract support is:

- methodology identity: source, method, version, rule id
- rule content: full rule text plus canonical source anchor
- review-enabling metadata: manual-review requirements, expected evidence types, STAC eligibility, and other rule-level flags where grounded
- provenance support: source artifact references and stable anchors
- contract stability: canonical shapes the app can consume without inventing methodology semantics

No downstream rule can be "green" unless the app shows visible support, and this repo must not imply otherwise through invented semantics.

## Current assets and how they fit

- Methods: contract layer defining what must be proven
- Complex methods: reality check so the product is not built only for toy cases
- AOI: downstream spatial scope object that links projects to geospatial evidence
- STAC: downstream geospatial fact source enabled only for eligible rules
- Projects: downstream workflow container owned by the app
- Verification packs: downstream export shell strengthened by canonical rule contracts
- Quick Check: downstream intake and triage layer, useful but not the core paid object

## VVB-ready definition

The system is VVB-ready only when all of the following are true:

- at least one target method can be reviewed end-to-end
- every verified rule has rationale, support, and provenance
- AOI and STAC facts appear only where relevant
- document and workbook evidence can be linked where needed
- export is reviewable outside the app
- the system does not overclaim or fake certainty
- the workflow saves meaningful reviewer time

## Non-goals

- no fake auto-verification
- no fake confidence
- no unsupported green checks
- no STAC-driven status flipping
- no formal certification opinion claims
- no app-workflow implementation in this repo
- no broad redesign or refactor outside this roadmap

## Phases

### Phase 0 - Roadmap + contract freeze

Outcome: one written roadmap and one shared phase-status system across both repos.

Methodology responsibilities:

- publish the methodology-side roadmap
- publish the matching phase-status scaffold
- freeze the canonical contract boundary for this roadmap

Shared deliverables:

- roadmap doc in both repos
- phase-status.json in both repos
- same roadmap id and phase sequence
- explicit repo boundaries
- explicit definition of the rule review record

Exit criteria:

- no ambiguity about what gets built first
- no ambiguity about which repo owns what

### Phase 1 - Rule review record

Outcome: a rule opens into a real review surface, not a status toggle.

Methodology responsibilities:

- expose full rule text cleanly
- expose stable source anchors cleanly
- stabilize the contract shape needed by the app

App dependency:

- build the review panel UI and persistence in `app.article6`

Exit criteria:

- clicking a rule opens a real review record in the app
- a reviewer can understand the rule and record rationale and support
- the contract shape can grow without redesign pressure on the app

### Phase 2 - Defensible verification

Outcome: "Verified" is no longer just a click.

Methodology responsibilities:

- add support-type metadata where needed
- add manual-review requirement flags where needed
- avoid encoding fake confidence or auto-decision semantics

App dependency:

- enforce rationale, support, reviewer identity, and timestamps in `app.article6`

Exit criteria:

- every verified rule has visible rationale and support
- a reviewer can inspect why a rule is green
- unsupported green checks are no longer possible

### Phase 3 - AOI + STAC support facts

Outcome: AOI and STAC become useful support for eligible rules.

Methodology responsibilities:

- define STAC eligibility by rule
- define expected fact shapes for STAC-supported rules
- preserve support-only semantics

App dependency:

- render AOI and STAC facts in rule review panels without status automation

Exit criteria:

- STAC appears only where appropriate
- STAC facts are inspectable and traceable
- STAC does not directly flip statuses

### Phase 4 - Document + workbook support

Outcome: non-geospatial evidence becomes first-class rule support.

Methodology responsibilities:

- define expected evidence-type contracts
- add optional fact templates per rule only where credible
- avoid fake precision in any extraction-oriented metadata

App dependency:

- implement uploads, fragment linking, evidence inventory integration, and support rendering

Exit criteria:

- a reviewer can support rules with document, workbook, and report references
- linked evidence is inspectable at source-fragment level
- evidence is traceable, not loosely attached

### Phase 5 - Method completeness on target methods

Outcome: at least one target method is complete enough to support a real pilot.

Methodology responsibilities:

- full `AR-ACM0003` coverage
- one second target method after that
- support matrix maturity
- canonical consistency checks
- encoding and coverage playbook for adding more methods

App dependency:

- consume richer method contracts without UI breakage

Exit criteria:

- one real target method can be reviewed end-to-end
- a second method proves repeatability
- methodology expansion has a clear playbook

### Phase 6 - Exportable verification output

Outcome: the review can be exported and inspected outside the app.

Methodology responsibilities:

- support canonical export fields only where needed
- keep export-support additions contract-safe and audit-friendly

App dependency:

- generate PDF and JSON exports with rule-by-rule rationale, support, provenance, and unresolved gaps

Exit criteria:

- exported pack is understandable outside the app
- every verified rule in export has visible support
- unresolved rules remain explicit

### Phase 7 - Pilot-ready VVB workflow

Outcome: the system is ready for paid pilot use.

Methodology responsibilities:

- hold the contract line while pilot feedback arrives
- add only grounded contract improvements required for pilot delivery

App dependency:

- workflow hardening, onboarding, demo path, and reviewer instructions

Exit criteria:

- one complete demo or pilot path works without hand-waving
- a VVB or project developer can understand the value quickly
- exports and review records hold up under scrutiny

## Sequencing

1. Phase 0 - roadmap + contract freeze
2. Phase 1 - rule review record
3. Phase 2 - defensible verification
4. Phase 3 - AOI + STAC support facts
5. Phase 4 - document + workbook support
6. Phase 5 - method completeness on target methods
7. Phase 6 - exportable verification output
8. Phase 7 - pilot-ready VVB workflow

## Immediate next action

Implement Phase 0 and Phase 1 only.

For this repo, that means:

- create this roadmap doc and matching phase-status file
- stabilize the rule text and source anchor contract in the upcoming Phase 1 work
- do not implement later phases as part of this roadmap freeze step

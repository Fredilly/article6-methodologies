**Status:** Phases 0–9 complete on `main` (deterministic Forestry + Agriculture ingest: META, sections, rules, registry stable across back-to-back runs).

# Article 6 Ingest = Manual Parity Plan

> **Sector naming note:** On disk, the internal sector slug `Forestry`
> corresponds to UNFCCC sector 14, “Afforestation and reforestation”.
> The folder `UNFCCC/Forestry` and fixtures `forestry-gold` keep this slug
> for stability and hashing, but external-facing docs, dashboards, and
> models should use the label “Afforestation and reforestation (UNFCCC 14)”.

## Goal

Make the `ingest` pipeline produce assets that match manually curated Forestry artefacts (complete META, provenance, real sections and rules, canonical foldering, deterministic hashes). Once merged, any new sector (for example Agriculture) auto-ingests at manual parity.

**Scope note:** Phases 0–9 are repo-wide invariants (pipeline + schemas + gates). They are not repeated per method or sector; Forestry and Agriculture were used as validation/stress cases.

---

- **Canonical environment**
  - Codespaces/devcontainer is the reference environment for deciding if a phase is complete.
  - Local Mac is for convenience only; if local behavior disagrees with Codespaces, treat the Codespaces result as truth.

## Progress Tracker

The canonical list of phases and their statuses lives in `docs/projects/phase-1-ingestion/phase-status.json`. Update that file, then run `npm run plan:update:ingest` so this plan mirrors the Git-tracked truth. Checkbox legend: `[ ]` = not started, `[-]` = in progress, `[x]` = completed.

---

## [x] Phase 0 - Baseline & Branch

**Branch:** Create a dedicated feature branch for this work (never push directly to `main` or `staging`).

**What**  
Freeze Forestry (Afforestation and reforestation, UNFCCC sector 14) as the gold reference and prove ingest currently fails parity.

**Do**

- Copy one complete Forestry trio (`META.json`, `sections.json`, `rules.rich.json` plus tools) to `tests/fixtures/forestry-gold/`.
- Add snapshot tests that diff ingest output versus the fixture.

**Done when**  
`npm run ingest:full` on identical inputs does not match the fixtures (red test confirms gaps).

---

## [x] Phase 1 - Paths & Foldering

**What**  
Enforce canonical layout:

```
tools/UNFCCC/<Program>/<Code>/vXX-0/**
methodologies/UNFCCC/<Program>/<Code>/vXX-0/**
```

**Do**

- Add a path normalizer to `scripts/resolve-ingest-scope.mjs`.
- Hard fail inside `scripts/ingest.sh` if the Program folder is missing or deviates.

**Done when**  
All Agriculture tools land under `tools/UNFCCC/Agriculture/**`.

---

## [x] Phase 2 - Rich META & Provenance

**What**  
Emit full manual-grade META.

**Do**

- Include:
  - `provenance.author`, `provenance.date`
  - `provenance.source_pdfs[]`
  - `audit.created_at`, `audit.created_by`
  - `audit_hashes.sections_json_sha256`
  - `audit_hashes.rules_json_sha256`
  - `audit_hashes.source_pdf_sha256`
  - `references.tools[].doc` pointing to `UNFCCC/<Code>@vXX.X`
- Auto-fill `automation.scripts_manifest_sha256`.
- Tool references (`references.tools[]`) and any future tool manifests MUST follow
  the canonical rules captured in `docs/ingest/TOOL_METADATA_CHECKLIST.md`. Any
  new tooling or ingest automation should validate against that checklist before
  writing to disk.

**Gate**  
Empty `doc` values or missing hashes cause the run to fail.

**Done when**  
META keys align with the Forestry fixture and the AJV schema passes.

---

## [x] Phase 3 - Section Extraction (Replace Stubs)

**What**  
Generate real `sections.json` from PDFs.

**Do**

- Add `scripts/extract-sections.cjs` using `pdftotext` (with a fallback to `pdfminer`, install via
  `python3 -m pip install pdfminer.six`) to dump a PDF into text and
  apply the header heuristic.
- Use a header heuristic:
  - treat a line as a section header if it is ALL CAPS or starts with a digit plus dot (`1.` `2.`),
  - ensure length is between 5 and 120 characters.
- Assign incremental IDs (`S-0001`, `S-0002`, ...) and capture the first non-empty line of the section body as an anchor.
- Expose Forestry automation via `npm run extract:sections:forestry`, which reads each `META.json`,
  resolves `provenance.source_pdfs[].path`, and overwrites `sections.json`. Re-run `node scripts/build-meta.cjs <method>`
  afterward so hashes stay in sync.
- Extract anchors and first paragraphs as `content`.

**Gate**  
If any `TODO` remains or the section count is below 5, fail the run. Use `npm run gate:sections` locally to ensure
Forestry outputs pass the sanity check before pushing.

---

## [x] Phase 4 - Rules (Rich -> Lean)

**What**  
Autogenerate `rules.rich.json` and derive the lean form.

**Do**

- Create `scripts/derive-rules-rich.cjs`.
- Map regex keywords to rule types:

| Keyword  | Type         |
|----------|--------------|
| eligib   | eligibility  |
| baseline | baseline     |
| monitor  | monitoring   |
| leakage  | leakage      |
| uncertain| uncertainty  |
| QA/QC    | monitoring   |

- Populate:
  - `logic` with the matching sentence or paragraph,
  - `summary` as a one-line compression,
  - `refs.sections[]` with section IDs,
  - `type` with the mapped value.
- Run `scripts/derive-lean-from-rich.js` to keep `rules.json` in sync.

**Gate**  
Missing `logic` or empty `refs.sections` causes failure.

---

## [x] Phase 5 - Previous Versions

**What**  
Add `previous/vYY-0` support that mirrors Forestry.

**Do**

- Write `methodologies/.../<active>/previous/vYY-0/`.
- Add `source-assets/**` plus tool pointers to the active version.
- Validate `effective_from` and `effective_to` if present in HTML or PDFs.

**Gate**  
Broken pointers or missing `source.pdf` trigger failure.

---

## [x] Phase 6 - Idempotency & Determinism

**What**  
Re-running produces zero diffs.

**Do**

- Sort keys alphabetically and arrays by `id`.
- Skip writes when the SHA-256 is unchanged.
- Drive the unified runner below:

```bash
#!/usr/bin/env bash
set -euo pipefail
INGEST_YML="${1:-ingest.yml}"
MODE="${2:---offline}"

node scripts/ingest-online.js "$INGEST_YML" || true
bash scripts/ingest.sh "$INGEST_YML" "$MODE"
node scripts/derive-lean-from-rich.js
bash scripts/hash-all.sh
node scripts/gen-registry.js
npm run validate:rich
npm run validate:lean
node scripts/check-quality-gates.js ingest-quality-gates.yml
```

**Health check**

- Running the full ingest + validation sequence twice in the canonical environment must leave `git status -sb` clean and `git diff` empty.
- This applies to methodologies artefacts, `scripts_manifest.json`, and `registry.json`; treat it as the acceptance gate for declaring Phase 6 complete and reference it whenever assessing phase stability.

---

## Golden fixture methods

- Representative Forestry (Afforestation and reforestation) + Agriculture fixtures: ACM0010, AM0073, AMS-III.D, AMS-III.R, AR-AM0014, AR-ACM0003, AR-AMS0003, AR-AMS0007.
- Never mask bugs by hand-editing these fixtures; every pipeline change must keep them ingestable, CI-green, and idempotent under the double-run health check.

## Spec vs reality rule

If the plan’s status line or checkboxes ever disagree with CI or current ingest outputs, treat it as a bug: either fix code/tests to match the spec or update the spec to match reality—never leave them divergent.

---

## [x] Phase 7 - Quality Gates & CI

**What**  
Prevent half-built artefacts from landing.

**Do**

- Add `ingest-quality-gates.yml`:

```yaml
schema_validation: true
hash_verification: true
registry_integrity: true
cross_reference: true
no_stubs: true
```

- Implement `scripts/check-quality-gates.js` (throw on failure).
- Wire the gate into GitHub Actions after `npm run validate:lean`.
- Tool-specific gating switches (`tool_meta_checklist`, `tool_openapi_checklist`)
  live in `ingest-quality-gates.yml`. When enabled they validate every tool
  manifest/OpenAPI pair against `docs/ingest/TOOL_METADATA_CHECKLIST.md` using
  the schemas in `schemas/tool-meta.schema.json` and
  `schemas/tool-openapi.schema.json`.

**Fail if**

- Tool path is wrong.
- `references.tools[].doc` is empty.
- `provenance` or `audit_hashes` is missing.
- Sections count is below 5 or contains `TODO`.
- Previous pointer cannot be resolved.
- Registry integrity check fails.
- Tool parity is broken (registry/tool pointers do not match on-disk files or the mirrored `tests/fixtures/*-gold/.../tools/` directories); see RC-2025-12-AR-AM0014-tool-parity in `docs/projects/phase-1-ingestion/ROOT_CAUSE.md`.

---

## [x] Phase 8 - Registry & App Parity

**What**  
Include Agriculture inside `registry.json`.

**Do**

- Ensure each entry has the correct `latest` flag.
- Set `kind` to `active` or `previous` accurately.
- Smoke test `app.article6` with `NEXT_PUBLIC_INCLUDE_PREVIOUS=1`.

---

## [x] Phase 9 - Sector Ingest Contract & Repo-wide Idempotency

**WHAT**

- Establish a single ingest contract that every sector must satisfy (Forestry, Agriculture, and all future sectors).
- Express the contract via canonical sector ingest configs (e.g. `ingest.yml`, `ingest.agriculture.yml`, `ingest.<sector>.yml`), deterministic double-run behavior, and stable `registry.json` / `scripts_manifest.json`.
- Apply this contract to the currently onboarded sectors using their configs (for example, Forestry and Agriculture) and treat them as the initial reference implementation and regression suite.

**DONE WHEN**

- Each sector marked as “migrated” in this plan has a checked-in sector config (`ingest.<sector>.yml` or equivalent).
- From a clean working tree in the canonical Codespaces/devcontainer environment, running `npm run ingest:full -- <sector-config>` twice for each migrated sector leaves `git status -sb` clean and `git diff --stat` empty on the second run (no movement in methodology artefacts, `scripts_manifest.json`, or `registry.json`).
- CI (`schema-validate`, `validate-json`, `stage-gates`) is green on `main` with all migrated sectors wired into `registry.json` and matching their `tests/fixtures/*-gold` expectations.
- The Phase 9 sector ingest contract is referenced by the “add a new sector/methodology” recipe so any new sector must pass the same double-run, zero-diff gate before being considered production-ready.

---

## Next 3–5 System Tasks

- Publish the add-method recipe doc that references the golden fixtures and requires the double-run health check before claiming a method is production-ready.
- Align the GeoVista contract + partner communications with the Root Cause Template expectations so every new ingest issue class is documented and tied to its acceptance criteria.
- Automate creation/review of Root Cause Template entries whenever CI detects a regression, ensuring the fix lists the updated spec bullets and links back to the health check evidence.
- Expose a slim Codex-visible status card that reports whether the latest double-run health check in the canonical environment passed and which Root Cause Template entries were touched in the last week.

---

## Schema Checklist

| File            | Must Contain                                             |
|-----------------|----------------------------------------------------------|
| `META.json`     | provenance, audit, `audit_hashes`, `references.tools.doc`|
| `sections.json` | at least 5 sections, no TODO placeholders                |
| `rules.rich.json` | logic, summary, `refs.sections`                        |
| `rules.json`    | lean version derived from rich                           |
| `registry.json` | valid paths and SHA-256 for every entry                  |

---

## Final CI Conditions

- `npm run validate:*` passes.
- `node scripts/check-quality-gates.js` returns 0.
- Double-run health check in the canonical environment leaves `git status -sb` clean and `git diff` empty for methodologies artefacts, `scripts_manifest.json`, and `registry.json`.
- Agriculture and Forestry (Afforestation and reforestation) entries exist in `registry.json`.

---

## PR Template

```
### WHAT
- Concise scope plus top files/paths touched.
- Cite whether work affects golden fixtures or Root Cause Template entries.

### WHY
- Motivations, determinism/integrity impact, and why the change matters now.

### CHANGES
- Bullet list of technical changes (scripts, schemas, ingest steps, CI gates).
- Commands/tests run, including the double-run health check when relevant.

### ACCEPTANCE
- Evidence that all gates passed (AJV, registry, quality gates).
- Link/reference the Root Cause Template entry when adding or updating invariants.
- State whether Agriculture/Forestry fixtures stayed green.

Signed-off-by: Fred E <fredilly@article6.org>
```
## Next roadmap

- Bring Verra / Gold Standard into the same ingest pipeline.
- Polish manifest UI and demo flows for regulators and partners.
- Tighten automation around tools, fixtures, and offline ingest.

## After Phase 9: Adding a new method

- Add the method config or update an existing sector config (`ingest.yml`, `ingest.<sector>.yml`).
- Run `npm run ingest:full -- <sector-config>` twice; the second run must leave `git diff` empty.
- Run `npm run validate:rich` and `npm run validate:lean`.
- Run `bash scripts/hash-all.sh` and `node scripts/gen-registry.js`.
- Run `node scripts/check-quality-gates.js ingest-quality-gates.yml`.
- Update/add fixtures under `tests/fixtures/*-gold/` only via pipeline outputs (no hand edits).
- If a new failure class is discovered, add a Root Cause entry via `node scripts/root-cause-new.cjs` and update invariants in this plan.

### Root Cause Template

Use this when we discover a new class of pipeline failure (not just a typo).

- **Name**: short label for the issue (e.g. “previous/META hash drift”)
- **Date**:
- **Area**: META / sections / rules / previous / registry / CI / other
- **Symptom**: what broke (error message, CI gate, surprising diff)
- **Root cause**: why it actually happened
- **New invariant**: the rule we want the pipeline to obey from now on
- **Spec update**: where we added/updated bullets in this plan
- **Code/tests**: scripts, schemas, or CI checks changed
- **Golden fixtures touched**: which methods were used to confirm the fix

- Detailed incident history lives in `docs/projects/phase-1-ingestion/ROOT_CAUSE.md` (for example RC-2025-12-AR-AM0014-tool-parity).
- When we fix a new class of failure, use `docs/projects/phase-1-ingestion/ROOT_CAUSE_PROMPT.md` to capture the entry plus any matching spec or code updates before committing.
Add one short entry per new issue class.

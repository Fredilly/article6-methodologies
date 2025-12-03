# Article 6 Ingest = Manual Parity Plan

## Goal

Make the `ingest` pipeline produce assets that match manually curated Forestry artefacts (complete META, provenance, real sections and rules, canonical foldering, deterministic hashes). Once merged, any new sector (for example Agriculture) auto-ingests at manual parity.

---

## Progress Tracker

The canonical list of phases and their statuses lives in `docs/projects/phase-1-ingestion/phase-status.json`. Update that file, then run `npm run plan:update:ingest` so this plan mirrors the Git-tracked truth. Checkbox legend: `[ ]` = not started, `[-]` = in progress, `[x]` = completed.

---

## [ ] Phase 0 - Baseline & Branch

**Branch:** `feat/ingest-equals-manual-v1`

**What**  
Freeze Forestry as the gold reference and prove ingest currently fails parity.

**Do**

- Copy one complete Forestry trio (`META.json`, `sections.json`, `rules.rich.json` plus tools) to `tests/fixtures/forestry-gold/`.
- Add snapshot tests that diff ingest output versus the fixture.

**Done when**  
`npm run ingest:full` on identical inputs does not match the fixtures (red test confirms gaps).

---

## [ ] Phase 1 - Paths & Foldering

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

**Gate**  
Empty `doc` values or missing hashes cause the run to fail.

**Done when**  
META keys align with the Forestry fixture and the AJV schema passes.

---

## [ ] Phase 3 - Section Extraction (Replace Stubs)

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

## [ ] Phase 4 - Rules (Rich -> Lean)

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

## [ ] Phase 5 - Previous Versions

**What**  
Add `previous/vYY-0` support that mirrors Forestry.

**Do**

- Write `methodologies/.../<active>/previous/vYY-0/`.
- Add `source-assets/**` plus tool pointers to the active version.
- Validate `effective_from` and `effective_to` if present in HTML or PDFs.

**Gate**  
Broken pointers or missing `source.pdf` trigger failure.

---

## [ ] Phase 6 - Idempotency & Determinism

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

---

## [ ] Phase 7 - Quality Gates & CI

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

**Fail if**

- Tool path is wrong.
- `references.tools[].doc` is empty.
- `provenance` or `audit_hashes` is missing.
- Sections count is below 5 or contains `TODO`.
- Previous pointer cannot be resolved.
- Registry integrity check fails.

---

## [x] Phase 8 - Registry & App Parity

**What**  
Include Agriculture inside `registry.json`.

**Do**

- Ensure each entry has the correct `latest` flag.
- Set `kind` to `active` or `previous` accurately.
- Smoke test `app.article6` with `NEXT_PUBLIC_INCLUDE_PREVIOUS=1`.

---

## [ ] Phase 9 - Migrate Agriculture

**What**  
Re-ingest ACM0010, AM0073, AMS-III.D, and AMS-III.R.

**Do**

```
npm run ingest:full -- ingest.agriculture.yml
```

**Done when**

- Artefacts mirror Forestry quality.
- All CI gates pass.
- No `TODO` or stub sections/rules remain.

---

## Codex TODO Block

```
# WHAT
Make ingest output match manual Forestry quality (META provenance, rich sections/rules, correct tool paths, previous versions, deterministic writes, quality gates).

# WHY
Automate without regressions; keep CI green; unblock Agriculture parity.

# TASKS
- [ ] P0 Fixture snapshot tests (forestry-gold)
- [ ] P1 Path enforcement
- [x] P2 Full META with provenance + hashes
- [ ] P3 Section extractor (>=5 sections)
- [ ] P4 Rules.rich generator + lean derivation
- [ ] P5 Previous version writer + validation
- [ ] P6 Deterministic ingest-full runner
- [ ] P7 Quality gates + CI integration
- [x] P8 Registry shaping + app test
- [ ] P9 Agriculture re-ingest + PR

# ACCEPTANCE
- Two consecutive runs produce zero diffs
- No "TODO" anywhere in methodologies/**
- META keys/hashes match Forestry fixture
- tools/UNFCCC/Agriculture/** structure is correct
- CI passes every gate
```

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
- `git diff` after a rerun is empty.
- Agriculture and Forestry entries exist in `registry.json`.
- PR title is `feat/ingest-equals-manual-v1`.

---

## PR Template

```
### WHAT
Upgrade ingest to match manual Forestry quality; re-ingest Agriculture at parity.

### WHY
One-shot automation that produces audit-ready outputs.

### CHANGES
- Enforced tool path structure
- Full META (provenance, audit, hashes)
- Real sections + rules (rich -> lean)
- Previous versions support
- Deterministic runner + quality gates
- Registry + CI updates

### ACCEPTANCE
✅ CI green
✅ No "TODO" or stub files
✅ Identical output on rerun
✅ Agriculture visible in registry
```

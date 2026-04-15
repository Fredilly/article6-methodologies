# Complete Methodology Coverage

Status is sourced from `phase-status.json`.

## Goal

Encode enough methodologies so the app can serve any VVB working with UNFCCC CDM forestry and agriculture methods. The app roadmap (verifiable-review-record) consumes these outputs — this repo supplies the data.

## What's already done

Rich rule schemas (RC-S1 through RC-S7) are locked. AR-ACM0003 v02-0 is encoded with rich rules, sections, and version lineage. Several agriculture methods are ingested. Manifest generation works.

## What's needed

The app's VRR-4 milestone requires at least 2 methodologies loadable (AR-ACM0003 + one agriculture method). VVB pilots will want their specific methodology. Encoding must be fast and repeatable.

## Parallel dependency

This roadmap feeds directly into `app.article6/docs/roadmaps/verifiable-review-record`. VRR-1 (review surface) is app-only. VRR-2+ need methodology data to be complete.

---

## CMC-1 — AR-ACM0003 Completeness (Week 1)

### Goal

Ensure AR-ACM0003 v02-0 has everything the app needs for the review surface.

### Deliverables

- Verify `rules.rich.json` has `text`, `logic`, `refs`, and `tags` for every rule
- Verify `sections.rich.json` has stable anchors for all sections
- Verify `META.json` has correct tool references and hashes
- Fix any gaps found during verification
- Run all existing AR-ACM0003 tests — must pass green

### Acceptance criteria

- [ ] Every rule in `rules.rich.json` has non-empty `text` field
- [ ] Section anchors resolve to valid PDF locations
- [ ] All AR-ACM0003 CI tests pass
- [ ] Manifest index.json includes AR-ACM0003 v02-0

---

## CMC-2 — One Agriculture Methodology (Week 2)

### Goal

Encode one complete agriculture methodology end-to-end so the app can demonstrate multi-methodology support.

### Deliverables

- Pick the best candidate from existing ingests (ACM0010 or AMS-III.A — whichever is most complete)
- Encode full `rules.rich.json` with text, logic, refs, tags
- Encode `sections.rich.json` with stable anchors
- Generate `META.json` with tool references
- Run CI — must pass all gates

### Selection criteria

- Most rules (max coverage for demo)
- Has multiple versions (version lineage support)
- Already has some ingest data in `batches/`

### Acceptance criteria

- [ ] Selected methodology has `rules.rich.json` with all rules populated
- [ ] Section anchors valid
- [ ] CI passes
- [ ] Manifest index.json includes the methodology
- [ ] App can load and display it alongside AR-ACM0003

---

## CMC-3 — Encoding Playbook (Week 3)

### Goal

Document the encoding process so new methodologies can be added in <1 day each. VVB pilots will bring their own methods.

### Deliverables

- Step-by-step encoding guide in `docs/ingest/ENCODING_PLAYBOOK.md`
- Template files for new methodology onboarding
- Checklist: what to verify before marking a methodology as "app-ready"
- Example: encode a second methodology using the playbook to validate it

### Acceptance criteria

- [ ] Playbook exists and covers: PDF source → sections → rules → rich → META → manifest
- [ ] Template files in `templates/` are up to date
- [ ] A new methodology can be encoded following only the playbook (tested)
- [ ] "App-ready" checklist has 5+ verification steps

---

## CMC-4 — Batch Encoding for Pilots (Weeks 4-5)

### Goal

Encode the top 3-5 methodologies that VVB pilots are most likely to request.

### Deliverables

- Encode AR-AM0014 (forestry, v02-0) — second forestry method
- Encode ACM0010 (agriculture, v03-0) — most-used agriculture method
- Encode one more based on pilot demand
- All pass CI gates
- Manifest includes all encoded methodologies

### Acceptance criteria

- [ ] 3+ methodologies fully encoded and app-ready
- [ ] All CI tests pass
- [ ] Manifest index.json complete
- [ ] App can switch between methodologies seamlessly

---

## Always-optimizing

1. **Data quality over quantity** — one perfect methodology beats three incomplete ones
2. **Stable IDs are sacred** — never change a rule_id or section_id after encoding
3. **Lean + rich separation** — keep rules.json thin, rules.rich.json rich
4. **CI gates are the contract** — if CI passes, the app can consume it
5. **Encoding speed matters** — VVB pilots can't wait 2 weeks for their methodology

## What this roadmap excludes

- New methodology sources (Gold Standard is lower priority than UNFCCC for Article 6)
- Schema redesign (RC-S1-S7 locked the contract)
- App UI work (that's the app repo's job)
- Document extraction (that's app-side VRR-3)

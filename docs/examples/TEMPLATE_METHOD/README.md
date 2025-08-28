# TEMPLATE_METHOD — authoring contract

**Rich is the authoring master.** Humans and Codex edit only:
- `sections.rich.json` — 13 canonical section anchors. Include `src` (doc+pages) and optional notes.
- `rules.rich.json` — atomic rules with IDs, types, `when`, inputs (with units), exact `logic`, and `refs`.

**Lean is generated.** Do not edit:
- `sections.json` — projection of rich, keeping only `{n,title,id}` (+ 8.1/8.2 children under data-parameters).
- `rules.json` — projection of rich, keeping only `{id,type,when,logic,refs?}` (refs trimmed to `{doc}` by default).

**Canonical section IDs (registry-agnostic, always present):**
scope-applicability, definitions, project-boundary-pools, baseline, project, leakage,
monitoring, data-parameters (children: data-parameters-ex-ante, data-parameters-ex-post),
uncertainty, permanence, tools, equations, annexes.

**Rule IDs:** `Standard.Domain.Method.Version.R-####`
(e.g., `UNFCCC.Forestry.AR-AMS0007.v03-1.R-0001`).

**Allowed rule types:** `eligibility | parameter | equation | calc | monitoring | leakage | uncertainty`.

**Notes**
- Prefer ASCII variable names (e.g., `dCO2e_AGB` instead of `ΔCO2e_AGB`).
- Keep output units in `logic` comments (rich only); projector may ignore them.
- Zeroing gates (pools off, shrub thresholds, etc.) must be explicit rules with `when` predicates and refs.

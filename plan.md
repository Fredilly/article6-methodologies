# Version Format Remediation Plan

## Scope
- Restore CI for `feat/unfccc-agriculture` by letting every validator/tooling surface accept both `vX-Y` and `v0X-Y` while Agriculture is migrated.
- Track all padded version paths + JSON references (see `audit/version-format-scan.json`).
- Execute the rollout in three PRs (A: relax, B: migrate, C: tighten) with dry-run diffs and CI notes per PR.

## Current Findings
- `audit/version-format-scan.json` (deterministic snapshot) enumerates 83 zero-padded directories across `methodologies`, `tools`, and `source-assets`, all under UNFCCC Forestry + Agriculture.
- JSON payloads referencing padded versions concentrate in `methodologies/UNFCCC/**/META.json`, `rules.rich.json`, and `sections.rich.json` (see token list in the audit file). Forestry references already mix padded + unpadded tokens, but new Agriculture drops only padded ones, tripping CI scripts that assumed canonical `vX-Y`.
- Regex consumers today: `schemas/rules.rich.schema.json` (`refs.tools[].doc`), `bin/mrv-cli.js`, `scripts/check-trio-and-registry.js`, `scripts/hash-all.sh`, `scripts/fill-provenance.js`, `scripts/offline/*.cjs`, and the GitHub workflow globs. None share a centralized helper, so we will add one.

## Execution Plan
1. **PR-A – Temporary Relax + Warning**
   - Add `core/versioning.js` with `CANONICAL_VERSION_RX = /^v\d-\d(?:-\d)?$/` and `LOOSE_VERSION_RX = /^v(?:0?\d)-\d(?:-\d)?$/`.
   - Update the scripts listed above (and the compiled AJV schemas via `scripts/compile-audit.js`) to consume `LOOSE_VERSION_RX`.
   - Introduce `scripts/preflight-version-format.js` (non-blocking) that surfaces every padded directory/token using `audit/version-format-scan.json` data; wire it into `schema-validate.yml` after `check-lean-drift` but allow warnings only (exit 0 unless `--strict`).
   - Tests: `node scripts/preflight-version-format.js`, `npm run validate:json`, `npm run gate`, `node scripts/validate-offline.js`.

2. **PR-B – Agriculture Migration**
   - Draft dry-run rename manifest (e.g., `reports/agri-version-moves.txt`) by mapping `v0X-Y → vX-Y` for all Agriculture dirs listed in the audit (including `/previous`, `tools`, `source-assets`).
   - Use `git mv` for directory renames and update in-file references (`META.version`, `references.tools[*].doc|path`, rule refs, dataset CSVs, manifests) via deterministic scripted edits.
   - Recompute hashes: run `scripts/hash-all.sh`, refresh `scripts_manifest.json` if needed, rebuild manifests (`npm run build:manifest` if required).
   - Run full validation suite: `npm run gate`, `node scripts/check-trio-and-registry.js`, `npm run validate:guardrails`, plus `node scripts/preflight-version-format.js --strict` to confirm only Forestry zero padding remains.

3. **PR-C – Tighten + Enforce**
   - Flip consumers back to `CANONICAL_VERSION_RX` (unpadded) and regenerate validators.
   - Make `scripts/preflight-version-format.js` fail CI on any `v0\d-` tokens and drop the temporary audit file (keep history per "never delete evidence" by superseding with note that scan moved to guardrails).
   - Add regression tests: e.g., `scripts/preflight-version-format.js` invoked in CI with `--strict`.

## Risks & Mitigations
- **Regex drift**: touching multiple scripts risks inconsistent patterns. Mitigation: central helper + unit-style assertions in `core/versioning.js`.
- **Rename blast radius**: `git mv` across `methodologies`, `tools`, and `source-assets` can break relative pointers. Mitigation: generate a dry-run diff + checklist before execution, and rely on `node scripts/check-trio-and-registry.js` to ensure path/version sync.
- **Hash churn**: `scripts/hash-all.sh` rewrites `META.json`; ensure deterministic order by running from clean tree and documenting new digests in PR notes.
- **Workflow lag**: new preflight must not fail CI until PR-B is merged. Mitigation: start with warning-only mode and document toggle location in `schema-validate.yml`.

## Rollback Strategy
- PR-A: revert `core/versioning.js`, schema/workflow tweaks, and remove the preflight script if it blocks. Because behavior change is additive, rollback = `git revert` of the PR merge.
- PR-B: keep the dry-run manifest so we can reverse renames via `git mv` using the same list; retain the original padded directories in git history for audit.
- PR-C: if regressions appear after tightening, reapply PR-A’s loose regex and re-run the preflight in warning mode while investigating.

## Evidence & Next Steps
- `audit/version-format-scan.json` is the canonical inventory for the rollout; it must be regenerated (and committed) whenever versions move.
- Before coding PR-A, confirm no additional scripts outside the enumerated list gate on version strings (search for `/v\d` and `@v` during implementation).

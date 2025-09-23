# Contributing Guidelines

Thanks for keeping Article6 methodologies audit-ready. This checklist focuses on deterministic updates and evidence requirements.

## Prerequisites
- Node.js `20.11.1` (use `nvm use` with the repository `.nvmrc`).
- Git configured with your Article6 email for `Signed-off-by` lines.
- Local clone of this repository; no network installs are required because dependencies are vendored.

## Adding or Updating Methodologies
1. **Create a branch**: `git switch -c feat/<ticket>`.
2. **Modify sources**: update rich JSON, references, scripts, or evidence as needed.
3. **Refresh automation**: run `./scripts/hash-all.sh` to regenerate `META.audit_hashes`, `META.automation`, and `scripts_manifest.json`.
4. **Validate**:
   - `npm run validate:rich`
   - `npm run validate:lean`
   - `./scripts/check-registry.sh`
   - Optional (recommended): `./scripts/check-lean-drift.sh` and `node scripts/check-source-hash.js`
5. **Review git status**: only deterministic changes (including updated `META` and manifests) should appear.
6. **Commit with sign-off**: `git commit -s -m "feat(scope): summary"`.
7. **Push and open a PR**: include WHAT/WHY, tests executed, and `Signed-off-by: Fred Egbuedike <fredilly@article6.org>`.

## Refreshing META and Automation Pins
Whenever any methodology JSON, script, or tool changes:
- Run `./scripts/hash-all.sh`.
- Re-run the validators above.
- Include the resulting updates to `META.json` files and `scripts_manifest.json` in the same commit.

## Committing Outputs and Evidence
- Evidence artifacts belong under `outputs/mvp/` (SVG/TXT/JSON logs) and should be referenced in the PR summary.
- Do **not** commit generated datasets or baselines outside the whitelisted folders unless specifically requested.
- Screenshots or decks referenced by investors are stored outside the repo; link them in the PR.

## Before Opening a Pull Request
- Complete every command listed in the Definition of Done (README).
- Ensure `npm run validate:lean` and `npm run validate:rich` output only “valid” lines (no diffs).
- Attach links or hashes for any new evidence in the PR description.
- Confirm CI is green after pushing the branch.

Following these steps keeps the repository deterministic and auditor-friendly.

# AGENTS

## Role
- Automate changes in `Fredilly/article6-methodologies`.
- Work in small, auditable steps.
- If unclear, output `QUESTIONS:` only.

## Non-negotiables
- Determinism: same input → same bytes.
- Integrity: hash methodology artefacts (SHA-256).
- No secrets in repo.

## What to hash
- `sections.json` → `META.audit_hashes.sections_json_sha256`
- `rules.json` → `META.audit_hashes.rules_json_sha256`
- `/tools/<ID>/**` → `META.references.tools[*]`
- `/scripts/**`, `/core/**` → `scripts_manifest.json` + `META.automation`
- Do **not** hash: README, RULESET, .github, registry.json, overrides (unless asked).

## Formats
- JSON: UTF-8, LF, 2-space indent.
- Timestamps: ISO-8601 UTC.
- Never delete evidence; supersede only.

## Commits
- Conventional Commit style.
- Body: explain WHAT + WHY.
- Include:

```
Signed-off-by: Fred Egbuedike <fredilly@yahoo.com>
```

## Output format
- `PLAN:` ≤8 bullets.
- `PATCH:` bundle (path → content) or unified diff.
- `TESTS:` expected CI checks.
- `QUESTIONS:` if blocked.

## Validation
- Always run JSON/schema/registry/hash checks.
- Stop on failure; do not commit partial changes.

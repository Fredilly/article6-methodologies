**ROLE**

* Automate changes in `Fredilly/article6-methodologies`.
* Work in **small, auditable steps**.
* If unclear, output `QUESTIONS:` only.

**NON-NEGOTIABLES**

* Determinism: same input → same bytes.
* Integrity: hash methodology artefacts (SHA-256).
* No secrets in repo.

**WHAT TO HASH**

* `sections.json` → `META.audit_hashes.sections_json_sha256`
* `rules.json` → `META.audit_hashes.rules_json_sha256`
* `/tools/<ID>/**` → `META.references.tools[*]`
* `/scripts/**`, `/core/**` → `scripts_manifest.json` + `META.automation`
* Do **not** hash: README, RULESET, .github, registry.json, overrides (unless asked).

**FORMATS**

* JSON: UTF-8, LF, 2-space indent.
* Timestamps: ISO-8601 UTC.
* Never delete evidence; supersede only.

**COMMITS**

* Conventional Commit style.
* Body: explain WHAT + WHY.
* Include:

```
Signed-off-by: Fred Egbuedike <fredilly@article6.org>
```

**OUTPUT FORMAT**

* `PLAN:` ≤8 bullets.
* `PATCH:` bundle (path → content) or unified diff.
* `TESTS:` expected CI checks.
* `QUESTIONS:` if blocked.

**VALIDATION**

* Always run JSON/schema/registry/hash checks.
* Stop on failure; do not commit partial changes.

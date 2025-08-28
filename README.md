# Article6 Methodologies (data-first, audit-ready)
Canonical store of methodologies: META + sections + rules (+ tools, overrides, tests, core).
For a working example of the file layout and content, see `docs/examples/TEMPLATE_METHOD`.
See RULESET.md for conventions and CI guardrails.

## Five Things mapping
1. Data-first methodologies
2. Audit-ready hashes
3. Open references
4. Reproducible scripts
5. CI guardrails

## Hashing policy
- sections.json -> META.audit_hashes.sections_json_sha256
- rules.json -> META.audit_hashes.rules_json_sha256
- tools/<ID>/**/* -> META.references.tools[]
- scripts/** and core/** -> scripts_manifest.json

## Workflow
1. Edit methodology content or scripts.
2. Run `./scripts/hash-all.sh` to refresh digests.
3. Commit the changes.
4. CI validates JSON, schemas, and registry consistency.

### Meta-driven source hash check
Use `scripts/check-source-hash.sh` to verify that all `META.references.tools[*]` entries exist and match their recorded SHA-256. This avoids assumptions about folder layout and treats `META` as the source of truth for tool paths.

## Conventions
- JSON UTF-8, LF, 2 spaces.
- Do not delete evidence; supersede only.
- registry.json mirrors `/methodologies`.

## Stable Tree v1
This structure is normative. Changes require a "Stable Tree vX" section and CI update.

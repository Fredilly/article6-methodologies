# Ruleset
- JSON UTF-8, LF, 2 spaces.
- META must include audit_hashes.{sections_json_sha256,rules_json_sha256}.
- Do not delete evidence; supersede only.
- registry.json mirrors /methodologies.

## Hash Policy Matrix

| Artifact | Path Pattern | Hash Destination |
| --- | --- | --- |
| Methodology sections | methodologies/<ID>/sections.json | META.audit_hashes.sections_json_sha256 |
| Methodology rules | methodologies/<ID>/rules.json | META.audit_hashes.rules_json_sha256 |
| Tool resources | tools/<ID>/** | META.references.tools[] {path, sha256, kind} |
| Repo scripts and core | scripts/**, core/** | scripts_manifest.json |

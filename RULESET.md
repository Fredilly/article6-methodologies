# Repo Setup Ruleset — Core Mantra

## The Five Things — File Mapping (Normative)
1) Compliance → `methodologies/<ID>/rules.json`
2) Audit → `methodologies/<ID>/sections.json` + `methodologies/<ID>/META.json` (must include `audit_hashes.sections_json_sha256` and `audit_hashes.rules_json_sha256`)
3) Tools → store originals in `/tools/**` and reference each under `META.json.references.tools[*]` with `path`, `sha256`, and `kind`.
4) Overrides → `/overrides/<ISO3>.json` (country thresholds, soils, law).
5) Registry → `registry.json` is the single index; every `<ID>` in `/methodologies` must be represented.

## Guardrails
- JSON: UTF‑8, LF, 2‑space indent. ISO‑8601 timestamps.
- Evidence is never deleted; only superseded.
- CI must pass validation (JSON, schema, registry mirror) before merge.

# Article6 Methodologies — Data‑First Repo

Implements the Five Things:
1) Compliance → `methodologies/<ID>/rules.json`
2) Audit → `methodologies/<ID>/sections.json` + `methodologies/<ID>/META.json` (with `audit_hashes.*`)
3) Tools → originals in `/tools/**` and listed in `META.references.tools[*]`
4) Overrides → `/overrides/<ISO3>.json`
5) Registry → `registry.json` mirrors `/methodologies`

Add a new method by copying `methodologies/TEMPLATE_METHOD`.

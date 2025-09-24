# Article6 Methodologies (data-first, audit-ready)
![Engine Health](https://img.shields.io/endpoint?url=https%3A%2F%2Fdemo.article6.org%2Fapi%2Fhealthz%3Fbadge%3D1)
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

## Definition of Done
- `./scripts/hash-all.sh` — updates `META.audit_hashes`, `META.automation`, and `scripts_manifest.json`.
- `npm run validate:rich` — ensures every rich JSON conforms to the schemas before deriving lean files.
- `npm run validate:lean` — validates all lean `META.json`, `sections.json`, and `rules.json` artifacts.
- `./scripts/check-registry.sh` — confirms `registry.json` mirrors the methodologies tree.

All four commands must complete without diffs or errors before opening a pull request. Capture any new evidence files under `outputs/mvp/` and include screenshots or logs referenced in the change summary.

## Baselines & CLI (Offline, Deterministic)

- Section retrieval (BM25):
  - Build dataset: `npm run dataset:sections`
  - Evaluate: `npm run eval:sections:bm25`
  - Example metrics (current corpus): `acc@1≈0.6250`, `mrr@5≈0.7333`

- Parameter/units extraction (TF‑IDF/Linear):
  - Build dataset: `npm run dataset:params`
  - Evaluate: `npm run eval:params:linear`
  - Example metrics: `variables micro‑F1≈0.6364`, `units micro‑F1≈0.9091`
- Rule-type labels (manual curation):
  - Dataset: `datasets/rule_type/rules.csv`
  - Categories defined in `datasets/rule_type/labels.yaml`
  - Update flow: edit CSV → `./scripts/hash-all.sh` → run validators.

- CLI retrieval wrapper:
  - Installable bin: `mrv-cli`
  - Usage: `npm run cli:query -- "<query text>" --k 5`
  - Prints top‑K rules with sections, summary, and refs (tool kind/path/sha256 lifted from META).

- HTTP engine adapter:
  - Installable bin: `http-engine-adapter`
  - Start locally: `npm run server:http -- --port 3030`
  - POST `http://<host>:<port>/query` with `{ "query": "forest leakage" }` (optional `top_k` ≤ 50).
  - Replies deterministically with BM25-ranked rules across AR-AMS0003 and AR-AMS0007 plus audit hashes (rules/sections/tool refs).
  - Metrics logging: every request prints `requests=<n> p95_ms=<latency>`; set `ENGINE_METRICS_LOG=/path/to/file.log` to append to disk.
- Serverless endpoint (Vercel-style `/api/query`):
  - GET `/api/query?text=forest+leakage[&top_k=5]` for ad-hoc checks.
  - POST `/api/query` with `{ "query": "forest leakage", "top_k": 5 }` for structured calls.
  - Delegates to the same deterministic BM25 engine to keep outputs aligned with the CLI/HTTP adapter.
- Health check:
  - GET `/api/healthz` → `{ "status": "ok", "documents": 26 }` (document count driven by corpus size).

Determinism
- Fixed BM25 params and TF‑IDF/Linear hyperparameters; stable ordering and splits.
- Dataset files recorded in `datasets_manifest.json` with SHA‑256.

See also: `docs/baselines-cli.md` for quickstart commands, expected metrics, and how to verify determinism locally.

### Meta-driven source hash check
Use `node scripts/check-source-hash.js` to verify that all `META.references.tools[*]` entries exist and match their recorded SHA-256. This avoids assumptions about folder layout and treats `META` as the source of truth for tool paths.

## Conventions
- JSON UTF-8, LF, 2 spaces.
- Do not delete evidence; supersede only.
- registry.json mirrors `/methodologies`.

## Stable Tree v1
This structure is normative. Changes require a "Stable Tree vX" section and CI update.

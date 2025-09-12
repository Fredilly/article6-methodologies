# Baselines & CLI (Offline, Deterministic)

Quickstart
- Build datasets (deterministic):
  - `npm run dataset:sections`
  - `npm run dataset:params`
- Run baselines (strictly offline):
  - Section retrieval (BM25): `npm run eval:sections:bm25`
  - Param/units extraction (TF‑IDF/Linear): `npm run eval:params:linear`
- Use the CLI retriever:
  - `npm run cli:query -- "carbon fraction CF 44/12" --k 3`

Expected metrics (current corpus)
- Retrieval (BM25): `acc@1≈0.6250`, `mrr@5≈0.7333`, `n≈8`
- Extraction (Linear): `variables micro‑F1≈0.6364`, `units micro‑F1≈0.9091`

Determinism checks
- Datasets: rebuild and verify no changes
  - `npm run dataset:sections && npm run dataset:params`
  - `git diff -- datasets datasets_manifest.json || true` (expect no diff)
- Baselines: rerun and compare metrics
  - `npm run eval:sections:bm25`
  - `npm run eval:params:linear`
  - Metrics should match the expected values above (allowing for corpus changes only when inputs change).

Notes
- No network calls; validators and datasets are built from local files.
- Hashes for governed artifacts and datasets are recorded (SHA‑256) for audit.


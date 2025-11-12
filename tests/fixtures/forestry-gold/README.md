# Forestry Gold Fixture

This snapshot freezes the manual Forestry triad for `UNFCCC/Forestry/AR-AMS0007@v03-1` (sourced from the `article6-methodologies-forestry` repo). It contains the `META.json`, `sections.json`, `rules.rich.json`, and associated tool PDFs needed for P0 parity checks.

To refresh:
1. Pull the latest manual Forestry repo.
2. Copy the updated trio + tools into this directory.
3. Regenerate `manifest.json` with:
   ```
   python3 - <<'PY'
   import hashlib, json
   from pathlib import Path
   root = Path('tests/fixtures/forestry-gold')
   files = []
   for path in sorted(root.rglob('*')):
       if path.is_file():
           rel = path.relative_to(root).as_posix()
           h = hashlib.sha256(path.read_bytes()).hexdigest()
           files.append({"path": rel, "sha256": h, "bytes": path.stat().st_size})
   manifest = {"files": files}
   Path('tests/fixtures/forestry-gold/manifest.json').write_text(json.dumps(manifest, indent=2) + "\\n")
   PY
   ```
4. Re-run the snapshot test with `node tests/forestry-gold.snapshot.test.cjs --expect-mismatch`.

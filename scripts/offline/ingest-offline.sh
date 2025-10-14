#!/usr/bin/env bash
set -euo pipefail

BATCH="${1:-offline_drop/batch.yml}"

need() { command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
need node
need python3
need jq

node scripts/offline/prepare-offline.cjs "$BATCH"

while IFS= read -r -d '' meta; do
  dir="$(dirname "$meta")"
  if ! ls "$dir/txt"/*.txt >/dev/null 2>&1; then
    node scripts/offline/pdf2txt.cjs "$dir" || { echo "[err] No TXT for $dir and no vendor parser; aborting"; exit 2; }
  fi
  python3 scripts/py/extract_sections.py "$dir"
  python3 scripts/py/extract_rules.py "$dir"
done < <(find methodologies -type f -name META.json -print0)

./scripts/derive-lean.sh
./scripts/json-canonical-check.sh --fix
./scripts/hash-all.sh
node scripts/offline/update-registry.cjs "$BATCH"

echo "[ok] offline ingest complete"

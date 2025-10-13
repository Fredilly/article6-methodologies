#!/usr/bin/env bash
set -euo pipefail
need(){ command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
need jq
need python3
found=0
while IFS= read -r -d '' dir; do
  rel="${dir#methodologies/}"
  IFS='/' read -r publisher sector method version <<<"$rel"
  meta="$dir/META.json"
  pdf=""
  if [ -f "$meta" ]; then
    pdf=$(jq -r '(.references.pdf.path // "")' "$meta")
  fi
  if [ -z "$pdf" ]; then
    pdf="tools/${publisher}/${method}/${version}/source.pdf"
  fi
  if [ ! -f "$pdf" ]; then
    echo "[skip] no pdf for $dir"
    continue
  fi
  found=1
  python3 scripts/derive_rich.py \
    --pdf "$pdf" \
    --out-sections "$dir/sections.rich.json" \
    --out-rules "$dir/rules.rich.json"
  jq -e 'type=="array" and length>0' "$dir/sections.rich.json" >/dev/null
  jq -e 'type=="array" and length>0' "$dir/rules.rich.json" >/dev/null
done < <(find methodologies -type d -name 'v*-*' -print0 | sort -z)
if [ "$found" -eq 0 ]; then
  echo "[warn] no version dirs found"
fi
echo "[derive] done."

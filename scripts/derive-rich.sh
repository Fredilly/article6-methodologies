#!/usr/bin/env bash
set -euo pipefail

[ -f ./.env.path ] && source ./.env.path || true
[ -f ./.env.pytools ] && source ./.env.pytools || true

need() { command -v "$1" >/dev/null || { echo "Missing required command: $1"; exit 1; }; }

need jq
need python3

found=0
while IFS= read -r -d '' verdir; do
  rel="${verdir#methodologies/}"
  IFS='/' read -r org sector method version <<EOF
$rel
EOF
  meta="$verdir/META.json"
  pdf=""
  if [ -f "$meta" ]; then
    doc_key="$org/$method@$version"
    pdf=$(jq -r --arg doc "$doc_key" '(.references.tools[]? | select(.doc == $doc) | .path) // empty' "$meta")
    if [ -n "$pdf" ] && [ ! -f "$pdf" ]; then
      pdf=""
    fi
  fi
  if [ -z "$pdf" ]; then
    tools_dir="tools/$org/$method/$version"
    if [ -f "$tools_dir/source.pdf" ]; then
      pdf="$tools_dir/source.pdf"
    elif [ -d "$tools_dir" ]; then
      pdf="$(find "$tools_dir" -maxdepth 1 -type f -name '*.pdf' | sort | head -n1 || true)"
    fi
  fi
  if [ -z "$pdf" ] || [ ! -f "$pdf" ]; then
    echo "[skip] no methodology pdf for $verdir"
    continue
  fi
  found=1
  echo "[derive] $verdir"
  python3 ./scripts/derive_rich.py \
    --pdf "$pdf" \
    --out-sections "$verdir/sections.rich.json" \
    --out-rules "$verdir/rules.rich.json"
  jq -e 'type=="array" and length>0' "$verdir/sections.rich.json" >/dev/null
  jq -e 'type=="array" and length>0' "$verdir/rules.rich.json" >/dev/null
done < <(find methodologies -type d -name "v*-*" -print0 | sort -z)

if [ "$found" -eq 0 ]; then
  echo "[warn] no methodology version dirs found (methodologies/**/vX-Y)"
  exit 0
fi

echo "[derive] done."

#!/usr/bin/env bash
set -euo pipefail

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ingest] missing dependency: $1" >&2
    exit 1
  fi
}

need yq
need jq
need node
need python3

if ! command -v pdftotext >/dev/null 2>&1; then
  echo "[ingest] warning: pdftotext not found; pdf-to-sections may fail" >&2
fi

INGEST_FILE="${INGEST_FILE:-ingest.yml}"
if [ ! -f "$INGEST_FILE" ]; then
  echo "[ingest] ingest file not found: $INGEST_FILE" >&2
  exit 1
fi

method_count=$(yq '.methods | length' "$INGEST_FILE")
echo "[ingest] methods: $method_count"

if [ "$method_count" -eq 0 ]; then
  echo "[ingest] nothing to do"
  exit 0
fi

repo_root=$(pwd)
base_dir=$(cd "$(dirname "$INGEST_FILE")" && pwd)

for ((i = 0; i < method_count; i++)); do
  id=$(yq -r ".methods[$i].id" "$INGEST_FILE")
  version=$(yq -r ".methods[$i].version" "$INGEST_FILE")
  sector=$(yq -r ".methods[$i].sector" "$INGEST_FILE")
  pdf_rel=$(yq -r ".methods[$i].assets.primary" "$INGEST_FILE")

  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "[ingest] missing id for methods[$i]" >&2
    exit 1
  fi
  if [ -z "$version" ] || [ "$version" = "null" ]; then
    echo "[ingest] missing version for $id" >&2
    exit 1
  fi
  if [ -z "$sector" ] || [ "$sector" = "null" ]; then
    echo "[ingest] missing sector for $id" >&2
    exit 1
  fi
  if [ -z "$pdf_rel" ] || [ "$pdf_rel" = "null" ]; then
    echo "[ingest] missing assets.primary for $id" >&2
    exit 1
  fi

  if [[ "$pdf_rel" = /* ]]; then
    pdf_path="$pdf_rel"
  else
    pdf_path="$base_dir/$pdf_rel"
  fi

  if [ ! -f "$pdf_path" ]; then
    echo "[ingest] pdf not found for $id: $pdf_path" >&2
    exit 1
  fi

  rest_path=$(echo "$id" | tr '.' '/')
  method_dir="$repo_root/methodologies/$rest_path/$version"
  mkdir -p "$method_dir"

  echo "———"
  echo "[ingest] $id $version"

  sections_output="$method_dir/sections.rich.json"
  node scripts/pdf-to-sections.js "$pdf_path" "$sections_output"
  if [ ! -s "$sections_output" ]; then
    echo "[ingest] sections.rich.json missing for $id" >&2
    exit 1
  fi

  python3 scripts/py/extract_rules.py "$method_dir"
  if [ ! -s "$method_dir/rules.rich.json" ]; then
    echo "[ingest] rules.rich.json missing for $id" >&2
    exit 1
  fi

  echo "[ingest] extracted sections + rules for $id"
done

echo "✅ ingest extraction complete"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
meta_schema="$ROOT/schemas/META.schema.json"

files=()
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(find "$ROOT/methodologies" -name META.json -print0)

if [ "${#files[@]}" -eq 0 ]; then
  exit 0
fi

args=(validate -s "$meta_schema")
for f in "${files[@]}"; do
  args+=(-d "$f")
done
"$ROOT/scripts/run-ajv.sh" "${args[@]}"

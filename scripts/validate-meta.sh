#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
meta_schema="$ROOT/schemas/META.schema.json"
previous_schema="$ROOT/schemas/META.previous.schema.json"

active=()
previous=()
while IFS= read -r -d '' file; do
  case "$file" in
    *"/previous/"*)
      previous+=("$file")
      ;;
    *)
      active+=("$file")
      ;;
  esac
done < <(find "$ROOT/methodologies" -name META.json -print0)

if [ "${#active[@]}" -gt 0 ]; then
  args=(validate -s "$meta_schema")
  for f in "${active[@]}"; do
    args+=(-d "$f")
  done
  "$ROOT/scripts/run-ajv.sh" "${args[@]}"
fi

if [ "${#previous[@]}" -gt 0 ]; then
  args=(validate -s "$previous_schema")
  for f in "${previous[@]}"; do
    args+=(-d "$f")
  done
  "$ROOT/scripts/run-ajv.sh" "${args[@]}"
fi

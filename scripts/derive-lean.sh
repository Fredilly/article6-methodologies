#!/usr/bin/env bash
set -euo pipefail

[ -f ./.env.path ] && source ./.env.path || true

need() { command -v "$1" >/dev/null || { echo "Missing required command: $1"; exit 1; }; }

need jq

while IFS= read -r -d '' verdir; do
  srich="$verdir/sections.rich.json"
  rrich="$verdir/rules.rich.json"
  if [ -f "$srich" ]; then
    jq '[ .[] | {id, number, title, level, page_start, page_end} ]' "$srich" > "$verdir/sections.json"
  fi
  if [ -f "$rrich" ]; then
    jq '[ .[] | {id, section_id, type, page, text} ]' "$rrich" > "$verdir/rules.json"
  fi
done < <(find methodologies -type d -name "v*-*" -print0 | sort -z)

echo "[derive-lean] done."

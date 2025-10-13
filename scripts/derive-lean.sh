#!/usr/bin/env bash
set -euo pipefail
need(){ command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
need jq
while IFS= read -r -d '' dir; do
  rich_sections="$dir/sections.rich.json"
  rich_rules="$dir/rules.rich.json"
  if [ -f "$rich_sections" ]; then
    jq '[ .[] | {id,number,title,level,page_start,page_end} ]' "$rich_sections" > "$dir/sections.json"
  fi
  if [ -f "$rich_rules" ]; then
    jq '[ .[] | {id,section_id,type,page,text} ]' "$rich_rules" > "$dir/rules.json"
  fi
done < <(find methodologies -type d -name 'v*-*' -print0 | sort -z)
echo "[derive-lean] done."

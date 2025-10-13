#!/usr/bin/env bash
set -euo pipefail

need() { command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
need jq

while IFS= read -r -d '' meta; do
  dir="$(dirname "$meta")"
  if [[ -f "$dir/sections.rich.json" ]]; then
    jq '{sections: (.sections // []) | map({id, title, anchors: (.anchors // []), content: (.content // null)})}' \
      "$dir/sections.rich.json" | jq -S . > "$dir/sections.json"
  fi
  if [[ -f "$dir/rules.rich.json" ]]; then
    jq '{rules: (.rules // []) | map({id, title, clause: (.clause // null), requirement: (.requirement // null), scope: (.scope // null), sources: (.sources // [])})}' \
      "$dir/rules.rich.json" | jq -S . > "$dir/rules.json"
  fi
done < <(find methodologies -type f -name META.json -print0)

echo "[ok] derive-lean complete"

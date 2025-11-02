#!/usr/bin/env bash
set -euo pipefail

need() { command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
need jq

while IFS= read -r -d '' meta; do
  dir="$(dirname "$meta")"
  if [[ -f "$dir/sections.rich.json" ]]; then
    jq '
      def pick_sections:
        if type == "array" then .
        elif type == "object" then (.sections // [])
        else [] end;
      def normalize_section:
        {
          id,
          title
        }
        + {anchors: (if (.anchors? and (.anchors | type) == "array") then .anchors else [] end)}
        + (if (.content? and (.content | type) == "string") then {content: .content} else {} end);
      {sections: (pick_sections | map(normalize_section))}
    ' "$dir/sections.rich.json" | jq -S . > "$dir/sections.json"
  fi
  if [[ -f "$dir/rules.rich.json" ]]; then
    jq '
      def pick_rules:
        if type == "array" then .
        elif type == "object" then (.rules // [])
        else [] end;
      def normalize_rule:
        {
          id,
          title
        }
        + (if (.clause? and (.clause | type) == "string") then {clause: .clause} else {} end)
        + (if (.requirement? and (.requirement | type) == "string") then {requirement: .requirement} else {} end)
        + (if (.scope? and (.scope | type) == "string") then {scope: .scope} else {} end)
        + {sources: (if (.sources? and (.sources | type) == "array") then .sources else [] end)};
      {rules: (pick_rules | map(normalize_rule))}
    ' "$dir/rules.rich.json" | jq -S . > "$dir/rules.json"
  fi
done < <(find methodologies -type f -name META.json -print0)

echo "[ok] derive-lean complete"

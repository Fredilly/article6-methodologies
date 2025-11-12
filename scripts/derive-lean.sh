#!/usr/bin/env bash
set -euo pipefail

need() { command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
need jq

SCOPE_SPEC="${LEAN_SCOPE:-methodologies}"
IFS=':' read -r -a SCOPE_PARTS <<<"$SCOPE_SPEC"
FIND_ROOTS=()
for root in "${SCOPE_PARTS[@]}"; do
  [ -z "${root// }" ] && continue
  if [ -d "$root" ]; then
    FIND_ROOTS+=("$root")
  fi
done
[ ${#FIND_ROOTS[@]} -eq 0 ] && FIND_ROOTS=("methodologies")

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
          text: (
            if (.summary? and (.summary | type) == "string" and (.summary | length) > 0) then .summary
            elif (.text? and (.text | type) == "string" and (.text | length) > 0) then .text
            elif (.logic? and (.logic | type) == "string") then .logic
            else "TODO: populate lean summary"
            end
          )
        }
        + (if (.refs?.sections? and (.refs.sections | type) == "array" and (.refs.sections | length) > 0)
            then {section_id: (.refs.sections[0])}
            else {} end)
        + (if (.tags? and (.tags | type) == "array") then {tags: .tags}
           elif (.type? and (.type | type) == "string") then {tags: [.type]}
           else {tags: []} end)
        + (if (.sources? and (.sources | type) == "array") then {sources: .sources} else {} end);
      {rules: (pick_rules | map(normalize_rule))}
    ' "$dir/rules.rich.json" | jq -S . > "$dir/rules.json"
  fi
done < <(find "${FIND_ROOTS[@]}" -type f -name META.json -print0)

echo "[ok] derive-lean complete"

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
        + (if (.anchor? and (.anchor | type) == "string") then {anchor: .anchor} else {} end)
        + (if (.section_number? and (.section_number | type) == "string") then {section_number: .section_number} else {} end)
        + (if (.stable_id? and (.stable_id | type) == "string") then {stable_id: .stable_id} else {} end)
        + (if (.pages? and (.pages | type) == "array" and (.pages | length) > 0) then {pages: .pages} else {} end)
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
        + (if (.refs?.section_anchor? and (.refs.section_anchor | type) == "string") then {section_anchor: .refs.section_anchor} else {} end)
        + (if (.refs?.section_number? and (.refs.section_number | type) == "string") then {section_number: .refs.section_number} else {} end)
        + (if (.refs?.section_stable_id? and (.refs.section_stable_id | type) == "string") then {section_stable_id: .refs.section_stable_id} else {} end)
        + (if (.stable_id? and (.stable_id | type) == "string") then {stable_id: .stable_id} else {} end)
        + (if (.refs?.pages? and (.refs.pages | type) == "array" and (.refs.pages | length) > 0) then {pages: .refs.pages} else {} end)
        + (if (.logic? and (.logic | type) == "string") then {logic: .logic} else {} end)
        + (if (.display?.title? and (.display.title | type) == "string") then {title: .display.title}
           elif (.summary? and (.summary | type) == "string") then {title: .summary}
           else {} end)
        + (if (.when? and (.when | type) == "array" and (.when | length) > 0) then {when: .when} else {} end)
        + (if (.tags? and (.tags | type) == "array") then {tags: .tags}
           elif (.type? and (.type | type) == "string") then {tags: [.type]}
           else {tags: []} end)
        + (if (.refs?.tools? and (.refs.tools | type) == "array" and (.refs.tools | length) > 0) then {tools: .refs.tools} else {} end)
        + (if (.sources? and (.sources | type) == "array") then {sources: .sources} else {} end);
      {rules: (pick_rules | map(normalize_rule))}
    ' "$dir/rules.rich.json" | jq -S . > "$dir/rules.json"
  fi
done < <(find methodologies -type f -name META.json -print0)

echo "[ok] derive-lean complete"

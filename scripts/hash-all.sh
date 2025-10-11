#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= //'
  fi
}

repo_commit_default=$(git rev-parse HEAD)
repo_commit=${A6_REPO_COMMIT:-$repo_commit_default}
skip_repo_commit=${A6_SKIP_REPO_COMMIT:-0}
check_only=${A6_CHECK_ONLY:-0}

guard_config=$(cat core/forestry-guardrails.json 2>/dev/null || echo '{}')

if [ "$check_only" -eq 1 ]; then
  scripts_manifest_sha=$(A6_CHECK_ONLY=1 ./scripts/hash-scripts.sh)
else
  scripts_manifest_sha=$(./scripts/hash-scripts.sh)
fi

status=0

for meta_file in $(find methodologies -name META.json | sort); do
  dir=$(dirname "$meta_file")
  sections_hash=$(hash_file "$dir/sections.json")
  rules_hash=$(hash_file "$dir/rules.json")
  rel=${dir#methodologies/}
  IFS=/ read -r org sector id version <<EOF2
$rel
EOF2
  tools_dir="tools/$org/$id/$version"
  tools_json='[]'
  if [ -d "$tools_dir" ]; then
    tools_json=$(find "$tools_dir" -type f | sort | while read -r f; do
      sha=$(hash_file "$f")
      size=$(wc -c < "$f")
      kind="${f##*.}"
      doc=$(printf "%s\n" "$f" | awk -F'/' '{org=$2; file=$NF; if (match(file, /^AR-[A-Z0-9]+_v[0-9]+(-[0-9]+)*\.(pdf|docx)$/)) {split(file,a,"_v"); tool=a[1]; ver=a[2]; sub(/\.(pdf|docx)$/,"",ver); gsub(/-/,".",ver); printf "%s/%s@v%s", org, tool, ver} else if (file ~ /(source\.(pdf|docx)|meth_booklet\.pdf)$/) {method=$3; ver=$4; gsub(/-/,".",ver); printf "%s/%s@%s", org, method, ver}}')
      printf '{"doc":"%s","path":"%s","sha256":"%s","size":%s,"kind":"%s"}\n' "$doc" "$f" "$sha" "$size" "$kind"
    done | jq -s '.')
  fi

  if [ "$check_only" -eq 1 ]; then
    current_sections=$(jq -r '.audit_hashes.sections_json_sha256 // ""' "$meta_file")
    current_rules=$(jq -r '.audit_hashes.rules_json_sha256 // ""' "$meta_file")
    current_tools=$(jq -c '(.references.tools // []) | sort_by(.path)' "$meta_file")
    current_manifest=$(jq -r '.automation.scripts_manifest_sha256 // ""' "$meta_file")

    if [ "$current_sections" != "$sections_hash" ]; then
      echo "$meta_file: sections hash drift" >&2
      status=1
    fi
    if [ "$current_rules" != "$rules_hash" ]; then
      echo "$meta_file: rules hash drift" >&2
      status=1
    fi
    if [ "$current_manifest" != "$scripts_manifest_sha" ]; then
      echo "$meta_file: scripts manifest sha drift" >&2
      status=1
    fi

    allowed_missing=$(printf '%s' "$guard_config" | jq --arg key "$rel" '.[$key].allowedMissingTools // []')
    echo "$current_tools" | jq -c '.[]' | while read -r entry; do
      path=$(printf '%s' "$entry" | jq -r '.path')
      doc=$(printf '%s' "$entry" | jq -r '.doc // ""')
      recorded_sha=$(printf '%s' "$entry" | jq -r '.sha256 // ""')
      recorded_size=$(printf '%s' "$entry" | jq -r '.size // 0')
      recorded_kind=$(printf '%s' "$entry" | jq -r '.kind // ""')

      if [ -f "$path" ]; then
        actual_sha=$(hash_file "$path")
        actual_size=$(wc -c < "$path")
        actual_kind="${path##*.}"
        if [ "$actual_sha" != "$recorded_sha" ] || [ "$actual_size" -ne "$recorded_size" ] || [ "$actual_kind" != "$recorded_kind" ]; then
          echo "$meta_file: recorded tool metadata mismatch for $path" >&2
          status=1
        fi
      else
        if printf '%s\n' "$allowed_missing" | jq -e --arg doc "$doc" 'index($doc)' >/dev/null; then
          continue
        fi
        echo "$meta_file: tool $doc missing from filesystem" >&2
        status=1
      fi
    done
    continue
  fi

  tmp="$meta_file.tmp"
  jq \
    --arg sections "$sections_hash" \
    --arg rules "$rules_hash" \
    --argjson tools "$tools_json" \
    --arg manifest "$scripts_manifest_sha" \
    --arg commit "$repo_commit" \
    --arg skip_commit "$skip_repo_commit" \
    '.audit_hashes.sections_json_sha256 = $sections |
     .audit_hashes.rules_json_sha256 = $rules |
     .references.tools = ((.references.tools // []) |
       reduce $tools[] as $t (
         .;
         if (map(.path == $t.path) | any) then
           map(if .path == $t.path then
                 .sha256 = $t.sha256
               | .size = $t.size
               | .doc = (if (.doc // "") == "" then $t.doc else .doc end)
               | .url = (.url // null)
               | .kind = (.kind // $t.kind)
               else . end)
         else
           . + [$t]
         end
       ) | sort_by(.path)) |
     .automation = (.automation // {}) |
     .automation.scripts_manifest_sha256 = $manifest |
     .automation.repo_commit = (if ($skip_commit == "1") then (.automation.repo_commit // $commit) else $commit end)' \
    "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
done

if [ "$check_only" -eq 1 ]; then
  exit $status
fi

echo "OK: refreshed META.audit_hashes, references.tools, and automation pins"

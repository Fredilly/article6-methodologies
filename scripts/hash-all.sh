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

repo_commit=$(git rev-parse HEAD)
scripts_manifest_sha=$(./scripts/hash-scripts.sh)

find methodologies -name META.json | sort | while read -r meta_file; do
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
  tmp="$meta_file.tmp"
  jq \
    --arg sections "$sections_hash" \
    --arg rules "$rules_hash" \
    --argjson tools "$tools_json" \
    --arg manifest "$scripts_manifest_sha" \
    --arg commit "$repo_commit" \
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
     .automation.repo_commit = $commit' \
    "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
done
echo "OK: refreshed META.audit_hashes, references.tools, and automation pins"

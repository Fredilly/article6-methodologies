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
      kind="${f##*.}"
      printf '{"path":"%s","sha256":"%s","kind":"%s"}\n' "$f" "$sha" "$kind"
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
     .references.tools = $tools |
     .automation = (.automation // {}) |
     .automation.scripts_manifest_sha256 = $manifest |
     .automation.repo_commit = $commit' \
    "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
done

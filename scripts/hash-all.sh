#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

repo_commit=$(git rev-parse HEAD)

scripts_manifest_sha=$(./scripts/hash-scripts.sh)

for j in methodologies/*; do
  [ -d "$j" ] || continue
  id=$(basename "$j")
  sections_hash=$(node core/hashing/sha256.js "$j/sections.json")
  rules_hash=$(node core/hashing/sha256.js "$j/rules.json")

  tools_dir="tools/$id"
  tools_json="[]"
  if [ -d "$tools_dir" ]; then
    tools_json=$(find "$tools_dir" -type f | sort | while read -r f; do
      sha=$(node core/hashing/sha256.js "$f")
      kind="${f##*.}"
      printf '{"path":"%s","sha256":"%s","kind":"%s"}\n' "$f" "$sha" "$kind"
    done | jq -s '.')
  fi

  meta_file="$j/META.json"
  tmp=$(mktemp)
  jq \
    --arg sections "$sections_hash" \
    --arg rules "$rules_hash" \
    --argjson tools "$tools_json" \
    --arg manifest "$scripts_manifest_sha" \
    --arg commit "$repo_commit" \
    '.audit_hashes.sections_json_sha256 = $sections |
     .audit_hashes.rules_json_sha256 = $rules |
     .references.tools = $tools |
     .automation = (.automation // {} | .scripts_manifest_sha256 = $manifest | .repo_commit = $commit)' \
    "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"

done

#!/usr/bin/env sh
set -eu

# Navigate to repository root
cd "$(dirname "$0")/.."

# Collect files under scripts and core
files=$(find scripts core -type f | sort)

# Metadata
generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
git_commit=$(git rev-parse HEAD)

# Build files array
entries=$(printf '%s\n' "$files" | while IFS= read -r f; do
  sha=$(node core/hashing/sha256.js "$f")
  printf '{"path":"%s","sha256":"%s"}\n' "$f" "$sha"
done)

printf '%s\n' "$entries" | jq -s --arg date "$generated_at" --arg commit "$git_commit" '{generated_at:$date, git_commit:$commit, files:.}' > scripts_manifest.json

# Output manifest hash
node core/hashing/sha256.js scripts_manifest.json

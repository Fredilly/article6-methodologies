#!/usr/bin/env bash
set -euo pipefail

# Meta-driven source hash checker
# Verifies that each path listed in META.references.tools[*].path exists
# and matches the recorded SHA-256 in META.references.tools[*].sha256.

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= //'
  fi
}

problems=0
while IFS= read -r -d '' meta; do
  # If no tools array, skip
  count=$(jq -r '(.references.tools // []) | length' "$meta")
  if [ "$count" = "0" ]; then
    echo "ℹ No tool refs in $meta"
    continue
  fi
  while IFS= read -r path; do
    if [ ! -f "$path" ]; then
      echo "❌ Missing source file referenced in $meta: $path"
      problems=1
      continue
    fi
    actual=$(hash_file "$path")
    recorded=$(jq -r --arg p "$path" '.references.tools[] | select(.path==$p) | .sha256' "$meta")
    if [ "$actual" != "$recorded" ]; then
      echo "❌ Hash mismatch in $meta for $path"
      echo "   recorded: $recorded"
      echo "   actual  : $actual"
      problems=1
    else
      echo "✅ OK: $path matches META in $(dirname "$meta")"
    fi
  done < <(jq -r '.references.tools[]?.path // empty' "$meta")
done < <(find methodologies -type f -name META.json -print0)

exit $problems


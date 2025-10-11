#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# choose available hashing command
hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= //'
  fi
}

files=$(find scripts core -type f | sort)

check_only=${A6_CHECK_ONLY:-0}

if [ "$check_only" -eq 1 ] && [ -f scripts_manifest.json ]; then
  generated_at=$(jq -r '.generated_at // ""' scripts_manifest.json)
  git_commit=$(jq -r '.git_commit // ""' scripts_manifest.json)
else
  generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  git_commit=$(git rev-parse HEAD)
fi

tmp_manifest=$(mktemp)
{
  printf '{\n'
  printf '  "generated_at": "%s",\n' "$generated_at"
  printf '  "git_commit": "%s",\n' "$git_commit"
  printf '  "files": [\n'
  first=1
  for f in $files; do
    sha=$(hash_file "$f")
    if [ $first -eq 0 ]; then printf ',\n'; fi
    printf '    { "path": "%s", "sha256": "%s" }' "$f" "$sha"
    first=0
  done
  printf '\n  ]\n'
  printf '}\n'
} > "$tmp_manifest"

if [ "$check_only" -eq 1 ]; then
  if [ ! -f scripts_manifest.json ]; then
    echo "scripts_manifest.json missing" >&2
    rm "$tmp_manifest"
    exit 1
  fi
  if ! cmp -s "$tmp_manifest" scripts_manifest.json; then
    echo "scripts_manifest.json drift detected" >&2
    mv "$tmp_manifest" scripts_manifest.expected.json
    exit 1
  fi
  rm "$tmp_manifest"
else
  mv "$tmp_manifest" scripts_manifest.json
fi

hash_file scripts_manifest.json

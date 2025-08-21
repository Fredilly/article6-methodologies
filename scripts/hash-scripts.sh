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

generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
git_commit=$(git rev-parse HEAD)

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
} > scripts_manifest.json

hash_file scripts_manifest.json

#!/bin/sh
set -eu

# Run from repo root
cd "$(dirname "$0")/.."

# choose available hashing command
hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= //'
  fi
}

# Stable, sorted list of files to include in the manifest
# (add/remove paths here if you want a different scope)
files=$(
  find scripts core -type f -print \
    | LC_ALL=C sort
)

# Deterministic timestamp + commit from git, not from wall clock
generated_at=$(git log -1 --format=%cI HEAD)
git_commit=$(git rev-parse HEAD)

# Build scripts_manifest.json in a stable format
{
  printf '{\n'
  printf '  "generated_at": "%s",\n' "$generated_at"
  printf '  "git_commit": "%s",\n' "$git_commit"
  printf '  "files": [\n'
  first=1
  for f in $files; do
    sha=$(hash_file "$f")
    if [ $first -eq 0 ]; then
      printf ',\n'
    fi
    printf '    { "path": "%s", "sha256": "%s" }' "$f" "$sha"
    first=0
  done
  printf '\n  ]\n'
  printf '}\n'
} > scripts_manifest.json

# Print only the SHA256 of the manifest itself
hash_file scripts_manifest.json

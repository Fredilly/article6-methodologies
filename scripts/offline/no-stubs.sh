#!/usr/bin/env bash
set -euo pipefail

fail=0
while IFS= read -r -d '' meta; do
  dir="$(dirname "$meta")"
  for f in sections.rich.json rules.rich.json sections.json rules.json; do
    if [ ! -s "$dir/$f" ]; then
      echo "[gate] missing or empty: $dir/$f"
      fail=1
    fi
  done
done < <(find methodologies -type f -name META.json -print0)

exit $fail

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Generate lean JSON from rich deterministically and fail if it would change files.
node "$ROOT/scripts/derive-lean-from-rich.js" >/dev/null

if ! git diff --quiet -- "$ROOT"/methodologies/**/sections.json "$ROOT"/methodologies/**/rules.json; then
  echo "Lean JSON drift detected. Run: node scripts/derive-lean-from-rich.js" >&2
  git --no-pager diff -- "$ROOT"/methodologies/**/sections.json "$ROOT"/methodologies/**/rules.json | sed -n '1,200p'
  exit 1
fi

echo "OK: no lean drift"


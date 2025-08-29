#!/usr/bin/env bash
set -euo pipefail

# One-shot verifier for lean generation drift
# - Runs deterministic rich→lean derivation
# - Fails if any methodologies/**/{sections.json,rules.json} would change

node scripts/derive-lean-from-rich.js >/dev/null
if ! git diff --quiet -- methodologies/**/sections.json methodologies/**/rules.json; then
  echo "✖ Lean generation drift detected. Run: node scripts/derive-lean-from-rich.js" >&2
  git --no-pager diff -- methodologies/**/sections.json methodologies/**/rules.json | sed -n '1,200p'
  exit 1
fi
echo "✓ Lean generation clean (no writes needed)"


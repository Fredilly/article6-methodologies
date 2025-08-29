#!/usr/bin/env bash
set -euo pipefail
out=$(scripts/gen-method.sh --dry-run || true)
echo "$out"
if echo "$out" | grep -q '^would write '; then
  echo "✖ Lean generation drift detected (see above)."
  exit 1
fi
echo "✓ Lean generation clean (no writes needed)"


#!/usr/bin/env bash
set -euo pipefail
echo "== CI: Offline Integrity Tests =="

./scripts/assert-offline.sh
./scripts/json-canonical-check.sh --check
./scripts/check-lfs-and-empty.sh
node ./scripts/check-trio-and-refs.js

# Optional: pure offline JSON Schema validation (no npm/network)
if [ -f scripts/validators/meta.cjs ] && [ -f scripts/validators/sections.cjs ] && [ -f scripts/validators/rules.cjs ]; then
  echo "-- validators present: running offline schema validation"
  node scripts/validate-offline.js
else
  echo "-- validators missing: skipping schema validation (no npm fetches)"
fi

echo "== CI: DONE (offline) =="

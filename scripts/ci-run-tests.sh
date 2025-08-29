#!/usr/bin/env bash
set -euo pipefail
echo "== CI: Offline Integrity Tests =="

# No-network guard
./scripts/assert-offline.sh

# Canonical JSON check (non-mutating)
./scripts/json-canonical-check.sh --check

# Trio + registry integrity (path + version + trio present)
node ./scripts/check-trio-and-registry.js

# Schemas vs validators consistency
node ./scripts/check-validators-sync.js

# META.tools hash verification (meta-driven; Node-based, no jq)
node ./scripts/check-source-hash.js

# Optional: pure offline JSON Schema validation (no npm/network)
if [ -f scripts/validators/meta.cjs ] && [ -f scripts/validators/sections.cjs ] && [ -f scripts/validators/rules.cjs ]; then
  echo "-- validators present: running offline schema validation"
  node scripts/validate-offline.js
else
  echo "-- validators missing: skipping schema validation (no npm fetches)"
fi

echo "== CI: DONE (offline) =="

#!/usr/bin/env bash
set -euo pipefail
echo "== CI: Offline Integrity Tests =="

./scripts/assert-offline.sh
./scripts/json-canonical-check.sh --check
./scripts/check-lfs-and-empty.sh
node ./scripts/check-trio-and-refs.js

echo "== CI: DONE (offline) =="

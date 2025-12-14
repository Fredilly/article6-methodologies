#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[ingest:verify] step: validate:lean"
npm run -s validate:lean

echo "[ingest:verify] step: quality gates"
node scripts/check-quality-gates.js ingest-quality-gates.yml

echo "[ingest:verify] step: tool hashes"
bash scripts/assert-tool-hashes.sh

echo "[ingest:verify] step: registry"
bash scripts/check-registry.sh

echo "[ingest:verify] step: canonical json"
./scripts/json-canonical-check.sh

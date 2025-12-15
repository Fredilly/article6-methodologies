#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

assert_clean() {
  local label="$1"

  if [ -n "$(git status --porcelain)" ]; then
    echo "[ingest:verify] FAIL: dirty working tree after ${label}" >&2
    git status --porcelain >&2
    exit 1
  fi

  if ! git diff --exit-code >/dev/null; then
    echo "[ingest:verify] FAIL: diff present after ${label}" >&2
    git diff >&2
    exit 1
  fi
}

run_twice() {
  local label="$1"
  local cmd="$2"

  echo "[ingest:verify] idempotency: ${label} (run 1/2)"
  eval "$cmd"
  assert_clean "${label} (run 1/2)"

  echo "[ingest:verify] idempotency: ${label} (run 2/2)"
  eval "$cmd"
  assert_clean "${label} (run 2/2)"
}

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

run_twice "status:methods" "npm run -s status:methods"
run_twice "status:sectors" "npm run -s status:sectors"

if node -e "process.exit(Object.prototype.hasOwnProperty.call(require('./package.json').scripts||{}, 'root-cause:index') ? 0 : 1)"; then
  run_twice "root-cause:index" "npm run -s root-cause:index"
else
  echo "[ingest:verify] skip: root-cause:index (missing)"
fi

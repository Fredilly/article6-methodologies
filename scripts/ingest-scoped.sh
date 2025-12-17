#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "$#" -lt 1 ]; then
  echo "Usage: scripts/ingest-scoped.sh <ingest-yml>"
  exit 1
fi

INGEST_YML="$1"
RUNS="${SCOPED_INGEST_RUNS:-1}"
IDEMPOTENT="${SCOPED_INGEST_ENFORCE_IDEMPOTENCY:-0}"

if ! [[ "$RUNS" =~ ^[0-9]+$ ]]; then
  echo "[ingest-scoped] invalid SCOPED_INGEST_RUNS value: ${RUNS}"
  exit 1
fi
if [ "$RUNS" -lt 1 ]; then
  echo "[ingest-scoped] SCOPED_INGEST_RUNS must be >= 1"
  exit 1
fi

pushd "$REPO_ROOT" >/dev/null

for ((run=1; run<=RUNS; run++)); do
  echo "[ingest-scoped] run ${run}/${RUNS} ingest=${INGEST_YML}"
  bash "${SCRIPT_DIR}/ingest-full.sh" "$INGEST_YML"
  echo "[ingest-scoped] validations (rich)"
  npm run -s validate:rich
  echo "[ingest-scoped] validations (lean)"
  npm run -s validate:lean
  echo "[ingest-scoped] quality gates"
  node "${SCRIPT_DIR}/check-quality-gates.js" ingest-quality-gates.yml
  echo "[ingest-scoped] scope drift gate"
  node "${SCRIPT_DIR}/check-scope-drift.mjs" --ingest-yml "$INGEST_YML" --allow registry.json
done

if [ "$IDEMPOTENT" = "1" ]; then
  echo "[ingest-scoped] enforcing git diff --exit-code"
  git diff --exit-code
  echo "[ingest-scoped] final scope drift gate"
  node "${SCRIPT_DIR}/check-scope-drift.mjs" --ingest-yml "$INGEST_YML" --allow registry.json
fi

popd >/dev/null

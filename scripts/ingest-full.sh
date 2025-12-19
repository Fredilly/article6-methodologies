#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INGEST_YML="${1:-ingest.yml}"
MODE="${2:---offline}"
export MODE

echo "[ingest-full] ingest file: ${INGEST_YML}"
echo "[ingest-full] mode: ${MODE}"

pushd "$REPO_ROOT" >/dev/null

echo "[ingest-full] step: validate batches"
node "${SCRIPT_DIR}/validate-batches.mjs"

if [ -f "${SCRIPT_DIR}/ingest-online.js" ]; then
  echo "[ingest-full] step: ingest-online"
  node "${SCRIPT_DIR}/ingest-online.js" "$INGEST_YML" || true
fi

echo "[ingest-full] step: ingest.sh"
INGEST_FILE="$INGEST_YML" bash "${SCRIPT_DIR}/ingest.sh"

if [ -f "${SCRIPT_DIR}/reshape-agriculture.js" ]; then
  echo "[ingest-full] step: reshape-agriculture"
  node "${SCRIPT_DIR}/reshape-agriculture.js"
fi

echo "[ingest-full] step: derive lean"
node "${SCRIPT_DIR}/derive-lean-from-rich.js"

echo "[ingest-full] step: hash-all"
bash "${SCRIPT_DIR}/hash-all.sh"

echo "[ingest-full] step: gen-registry"
node "${SCRIPT_DIR}/gen-registry.js"

echo "[ingest-full] step: validate:rich"
npm run -s validate:rich

echo "[ingest-full] step: validate:lean"
npm run -s validate:lean

echo "[ingest-full] step: quality gates"
node "${SCRIPT_DIR}/check-quality-gates.js" ingest-quality-gates.yml

echo "[ingest-full] step: canonical-json"
./scripts/json-canonical-check.sh --fix
./scripts/json-canonical-check.sh

if [ "${ARTICLE6_WORKSTATE:-0}" = "1" ]; then
  node "${SCRIPT_DIR}/workstate-update.mjs" --task "ingest:full" --scope "$INGEST_YML"
fi

popd >/dev/null

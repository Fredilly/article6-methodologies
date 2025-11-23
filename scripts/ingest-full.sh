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

if [ -f "${SCRIPT_DIR}/ingest-online.js" ]; then
  node "${SCRIPT_DIR}/ingest-online.js" "$INGEST_YML" || true
fi

INGEST_FILE="$INGEST_YML" bash "${SCRIPT_DIR}/ingest.sh"
node "${SCRIPT_DIR}/derive-lean-from-rich.js"
bash "${SCRIPT_DIR}/hash-all.sh"
node "${SCRIPT_DIR}/gen-registry.js"
npm run -s validate:rich
npm run -s validate:lean
node "${SCRIPT_DIR}/check-quality-gates.js" ingest-quality-gates.yml

popd >/dev/null

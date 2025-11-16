#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INGEST_YML="${1:-ingest.yml}"
MODE="${2:---offline}"

echo "[ingest-full] ingest file: ${INGEST_YML}"
echo "[ingest-full] mode: ${MODE}"

pushd "$REPO_ROOT" >/dev/null

INGEST_FILE="$INGEST_YML" bash "${SCRIPT_DIR}/ingest.sh"
node "${SCRIPT_DIR}/derive-lean-from-rich.js"

popd >/dev/null

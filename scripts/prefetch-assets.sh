#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/prefetch-assets.sh [options]

Options:
  -i, --ingest <file>   Path to ingest YAML (default: ingest.yml)
  -p, --parallel <n>    Number of concurrent workers (default: $PARALLELISM or 4)
  -h, --help            Show this help message

Environment:
  INGEST_ASSET_ROOT     Destination cache directory (default: $PWD/source-assets)
  PARALLELISM           Default parallel worker count when --parallel omitted
EOF
}

INGEST_FILE="ingest.yml"
PARALLELISM="${PARALLELISM:-4}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -i|--ingest)
      shift
      [ "$#" -gt 0 ] || { echo "Missing value for --ingest" >&2; exit 1; }
      INGEST_FILE="$1"
      ;;
    -p|--parallel)
      shift
      [ "$#" -gt 0 ] || { echo "Missing value for --parallel" >&2; exit 1; }
      PARALLELISM="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if ! command -v yq >/dev/null 2>&1; then
  echo "[prefetch] yq is required" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INGEST_SCRIPT="${SCRIPT_DIR}/ingest.sh"

if [ ! -f "$INGEST_FILE" ]; then
  echo "[prefetch] ingest file not found: $INGEST_FILE" >&2
  exit 1
fi

method_count="$(yq '.methods | length' "$INGEST_FILE")"
if ! [[ "$method_count" =~ ^[0-9]+$ ]]; then
  echo "[prefetch] could not determine method count from $INGEST_FILE" >&2
  exit 1
fi

if [ "$method_count" -eq 0 ]; then
  echo "[prefetch] no methods defined in $INGEST_FILE"
  exit 0
fi

if ! [[ "$PARALLELISM" =~ ^[0-9]+$ ]] || [ "$PARALLELISM" -le 0 ]; then
  PARALLELISM=1
fi

echo "[prefetch] warming cache for ${method_count} method(s) (parallel=${PARALLELISM})"

CACHE_ROOT="${INGEST_ASSET_ROOT:-$PWD/source-assets}"

if [ "$PARALLELISM" -le 1 ]; then
  for idx in $(seq 0 $((method_count - 1))); do
    env \
      INGEST_FILE="$INGEST_FILE" \
      INGEST_METHOD_INDEX="$idx" \
      PREFETCH_ONLY=1 \
      DRY_RUN=1 \
      RUN_VALIDATE=0 \
      AUTO_COMMIT=0 \
      INGEST_ASSET_ROOT="$CACHE_ROOT" \
      "$INGEST_SCRIPT"
  done
else
  export INGEST_FILE
  export INGEST_SCRIPT_PATH="$INGEST_SCRIPT"
  export INGEST_ASSET_ROOT="$CACHE_ROOT"
  seq 0 $((method_count - 1)) | xargs -P "$PARALLELISM" -n1 bash -c '
    set -euo pipefail
    idx="$1"
    env \
      INGEST_FILE="$INGEST_FILE" \
      INGEST_ASSET_ROOT="$INGEST_ASSET_ROOT" \
      INGEST_METHOD_INDEX="$idx" \
      PREFETCH_ONLY=1 \
      DRY_RUN=1 \
      RUN_VALIDATE=0 \
      AUTO_COMMIT=0 \
      "$INGEST_SCRIPT_PATH"
  ' _ 
fi

echo "[prefetch] syncing Agriculture source-assets from tools/"
node "${SCRIPT_DIR}/fetch-agriculture-previous.js"

echo "[prefetch] cache ready under ${CACHE_ROOT}"

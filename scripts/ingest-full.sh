#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ge 1 ] && [[ "$1" != --* ]]; then
  LINKS_FILE="$1"
  shift
else
  LINKS_FILE="${INGEST_LINKS:-}"
fi

if [ "$#" -ge 1 ] && [[ "$1" != --* ]]; then
  OUT_FILE="$1"
  shift
else
  OUT_FILE="${INGEST_OUT:-}"
fi

EXTRA_ARGS=("$@")

if [ -z "${LINKS_FILE:-}" ] || [ -z "${OUT_FILE:-}" ]; then
  cat <<'USAGE' >&2
Usage: scripts/ingest-full.sh <links.txt> <ingest.yml> [--dry-run]

Environment fallback:
  INGEST_LINKS  Path to links file when arguments are omitted.
  INGEST_OUT    Path to output ingest.yml when arguments are omitted.

Optional flags:
  --dry-run     Pass-through flag for ingest-from-pages (no downloads)
USAGE
  exit 1
fi

if [ ! -f "$LINKS_FILE" ]; then
  echo "[ingest-full] links file not found: $LINKS_FILE" >&2
  exit 1
fi

echo "[ingest-full] ingesting assets from $LINKS_FILE"
node scripts/ingest-from-pages.js --links "$LINKS_FILE" --out "$OUT_FILE" "${EXTRA_ARGS[@]}"

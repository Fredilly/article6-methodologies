#!/usr/bin/env bash
set -euo pipefail

node scripts/node/ingest.mjs "$@"

if [ -x ./scripts/derive-rich.sh ]; then
  ./scripts/derive-rich.sh
else
  echo "[note] derive-rich.sh not found"
fi

if [ -x ./scripts/derive-lean.sh ]; then
  ./scripts/derive-lean.sh
else
  echo "[note] derive-lean.sh not found"
fi

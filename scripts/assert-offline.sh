#!/usr/bin/env bash
set -euo pipefail
if ps aux | grep -E "[n]pm( |$)" >/dev/null 2>&1; then
  echo "✖ Detected npm process; tests must be offline"; exit 1
fi
echo "✓ Offline guard OK"

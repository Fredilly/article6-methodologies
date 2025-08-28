#!/usr/bin/env bash
set -euo pipefail
# Fail if npm is running; do not rely on network.
if command -v pgrep >/dev/null 2>&1; then
  if pgrep -x npm >/dev/null 2>&1; then
    echo "✖ Detected npm process; tests must be offline"; exit 1
  fi
fi
echo "✓ Offline guard OK"


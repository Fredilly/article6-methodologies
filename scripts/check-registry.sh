#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REG="$ROOT/registry.json"
[ -f "$REG" ] || { echo "registry.json missing"; exit 1; }
if [ -x "$ROOT/node_modules/.bin/jq" ]; then
  JQ="$ROOT/node_modules/.bin/jq"
elif command -v jq >/dev/null 2>&1; then
  JQ="$(command -v jq)"
else
  echo "jq is required. Install via npm (jq-cli-wrapper) or your package manager." >&2
  exit 1
fi
"$JQ" -e . "$REG" >/dev/null
echo "registry.json valid"

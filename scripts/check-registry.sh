#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REG="$ROOT/registry.json"
[ -f "$REG" ] || { echo "registry.json missing"; exit 1; }
jq -e . "$REG" >/dev/null
echo "registry.json valid"

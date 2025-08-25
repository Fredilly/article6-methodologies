#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
BIN="$ROOT/vendor/ajv-cli/node_modules/.bin/ajv"

if [ ! -x "$BIN" ]; then
  "$ROOT/scripts/install-vendored-ajv.sh"
fi

exec "$BIN" "$@"

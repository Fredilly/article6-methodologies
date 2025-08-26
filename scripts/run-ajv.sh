#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/vendor/ajv-cli/node_modules/.bin/ajv"
[ -x "$BIN" ] || "$ROOT/scripts/install-vendored-ajv.sh"
exec "$BIN" "$@"

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NP="$ROOT/tools/vendor/npm"
PREFIX="$ROOT/vendor/ajv-cli"
BIN="$PREFIX/node_modules/.bin/ajv"
command -v npm >/dev/null || { echo "npm not found"; exit 1; }
[ -d "$NP" ] || { echo "Missing dir: $NP"; exit 1; }
count="$(ls -1 "$NP"/*.tgz 2>/dev/null | wc -l | tr -d '[:space:]')"
[ "$count" -gt 0 ] || { echo "No tarballs found in $NP"; exit 1; }
mkdir -p "$PREFIX"
[ -f "$PREFIX/package.json" ] || (cd "$PREFIX" && npm init -y >/dev/null 2>&1)
ABS_NP="$(cd "$NP" && pwd)"
ARGS=()
for f in "$ABS_NP"/*.tgz; do tar -tzf "$f" >/dev/null 2>&1 || { echo "Corrupt tarball: $f"; exit 1; }; ARGS+=("file:$f"); done
(cd "$PREFIX" && npm install --no-audit --no-fund --install-strategy=shallow "${ARGS[@]}")
[ -x "$BIN" ] || { echo "ajv-cli not installed correctly"; exit 1; }
echo "Vendored ajv ready: $BIN"

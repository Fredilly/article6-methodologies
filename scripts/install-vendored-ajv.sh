#!/usr/bin/env bash
set -euo pipefail
dir="tools/vendor/npm"
if ! ls "$dir"/ajv-*.tgz "$dir"/ajv-formats-*.tgz "$dir"/ajv-cli-*.tgz >/dev/null 2>&1; then
  echo "MISSING_VENDOR_TARBALLS: Provide AJV tarballs under tools/vendor/npm" >&2
  exit 1
fi
npm i -D --no-audit --no-fund \
  ./tools/vendor/npm/ajv-8.17.1.tgz \
  ./tools/vendor/npm/ajv-formats-2.1.1.tgz \
  ./tools/vendor/npm/ajv-cli-5.0.0.tgz

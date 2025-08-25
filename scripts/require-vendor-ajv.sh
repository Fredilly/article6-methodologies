#!/usr/bin/env bash
set -euo pipefail
dir="tools/vendor/npm"
if ! ls "$dir"/ajv-*.tgz "$dir"/ajv-formats-*.tgz "$dir"/ajv-cli-*.tgz >/dev/null 2>&1; then
  echo "MISSING_VENDOR_TARBALLS: Provide AJV tarballs under tools/vendor/npm" >&2
  exit 1
fi


#!/usr/bin/env bash
set -euo pipefail

tarballs=(
  tools/vendor/npm/ajv-8.x.y.tgz
  tools/vendor/npm/ajv-formats-2.x.y.tgz
  tools/vendor/npm/ajv-cli-5.x.y.tgz
)

missing=0
for t in "${tarballs[@]}"; do
  if [[ ! -f "$t" ]]; then
    missing=1
  fi
done

if [[ $missing -eq 1 ]]; then
  echo "MISSING_VENDOR_TARBALLS: Provide AJV tarballs under tools/vendor/npm" >&2
  exit 1
fi

npm --prefix tools/vendor/ajv install --no-audit --no-fund \
  ./tools/vendor/npm/ajv-8.x.y.tgz \
  ./tools/vendor/npm/ajv-formats-2.x.y.tgz \
  ./tools/vendor/npm/ajv-cli-5.x.y.tgz

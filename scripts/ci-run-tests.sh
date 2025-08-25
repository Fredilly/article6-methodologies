#!/usr/bin/env bash
set -euo pipefail

AJV_PATH="tools/vendor/ajv/node_modules/.bin"
if [ -d "$AJV_PATH" ]; then
  PATH="$AJV_PATH:$PATH"
fi

if ! command -v ajv >/dev/null 2>&1; then
  echo "MISSING_VENDOR_TARBALLS: Provide AJV tarballs under tools/vendor/npm" >&2
  exit 1
fi

find methodologies -name sections.json -print0 | xargs -0 -n1 -I{} npx --no-install ajv validate -s schemas/sections.schema.json -d {}
find methodologies -name rules.json -print0 | xargs -0 -n1 -I{} npx --no-install ajv validate -s schemas/rules.schema.json -d {}

node tests/schema-validate.test.js

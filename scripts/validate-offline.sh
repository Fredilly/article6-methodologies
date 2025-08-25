#!/usr/bin/env bash
set -euo pipefail
export NPM_CONFIG_FUND=false
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_OFFLINE=true
export NPM_CONFIG_REGISTRY=http://127.0.0.1
./scripts/install-vendored-ajv.sh
npm run validate:all

#!/usr/bin/env bash
set -euo pipefail
./scripts/install-vendored-ajv.sh
npm run validate:all

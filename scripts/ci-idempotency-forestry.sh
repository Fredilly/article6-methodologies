#!/usr/bin/env bash
set -euo pipefail
set -x

bash "$(dirname "$0")/ci-idempotency.sh" --program UNFCCC --sector forestry

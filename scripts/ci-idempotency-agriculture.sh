#!/usr/bin/env bash
set -euo pipefail

bash "$(dirname "$0")/ci-idempotency.sh" --program UNFCCC --sector agriculture

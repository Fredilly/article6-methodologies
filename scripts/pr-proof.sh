#!/usr/bin/env bash
set -euo pipefail

PR="${1:-}"
if [[ -z "${PR}" ]]; then
  echo "usage: scripts/pr-proof.sh <pr-number>" >&2
  exit 2
fi

bash scripts/pr-truth.sh "${PR}"

SHA="$(gh pr view "${PR}" --json headRefOid -q .headRefOid)"
echo
echo "== PR head SHA =="
echo "${SHA}"

bash scripts/commit-truth.sh "${SHA}"

#!/usr/bin/env bash
set -euo pipefail

PR="${1:-}"
if [[ -z "${PR}" ]]; then
  echo "usage: scripts/pr-truth.sh <pr-number>" >&2
  exit 2
fi

echo "== PR head =="
gh pr view "$PR" --json headRefOid --jq '{head:.headRefOid}'

echo
echo "== BLOCKERS (anything not SUCCESS/SKIPPED) =="
gh pr view "$PR" --json statusCheckRollup --jq '
  .statusCheckRollup
  | map(select(.name != null))
  | map({name,status,conclusion,url:.detailsUrl})
  | map(select((.status != "COMPLETED") or (.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != null)))
  | if length == 0 then "✅ none" else .[] end
'

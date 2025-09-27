#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

require_clean_tree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "✖ mvp:check requires a clean git worktree. Commit, stash, or revert local changes first." >&2
    exit 1
  fi
}

show_diff_and_fail() {
  local message="$1"; shift
  local -a files=("$@")
  echo "✖ ${message}" >&2
  if (( ${#files[@]} )); then
    git --no-pager diff -- "${files[@]}" | sed -n '1,200p'
    git checkout -- "${files[@]}"
  fi
  exit 1
}

require_clean_tree

echo "== Canonical JSON check"
node scripts/json-canonical-check.sh

echo "== Derive lean JSON from rich sources"
node scripts/derive-lean-from-rich.js >/tmp/mvp-derive.log 2>&1 || { cat /tmp/mvp-derive.log >&2; exit 1; }
mapfile -t lean_drift < <(git diff --name-only -- methodologies | grep -E '(sections\\.json|rules\\.json)$' || true)
if (( ${#lean_drift[@]} )); then
  show_diff_and_fail "Lean JSON drift detected. Run: node scripts/derive-lean-from-rich.js" "${lean_drift[@]}"
fi

echo "== Validators (rich + lean)"
npm run --silent validate:rich
npm run --silent validate:lean

echo "== Hash refresh (META audit + scripts manifest)"
./scripts/hash-all.sh >/tmp/mvp-hash.log 2>&1 || { cat /tmp/mvp-hash.log >&2; exit 1; }
mapfile -t hash_drift < <(git diff --name-only -- methodologies scripts_manifest.json | grep -E '(META\\.json|sections\\.json|rules\\.json|scripts_manifest\\.json)$' || true)
if (( ${#hash_drift[@]} )); then
  show_diff_and_fail "Hash drift detected. Run: ./scripts/hash-all.sh" "${hash_drift[@]}"
fi

echo "== Registry + trio integrity"
node scripts/check-trio-and-registry.js

echo "== Source hash + supply-chain guards"
node scripts/check-source-hash.js
node scripts/check-workflows-supplychain.js

echo "== MVP gate complete"

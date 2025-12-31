#!/usr/bin/env bash
set -euo pipefail

fail_diag() {
  rc="${1:-1}"
  echo "== agriculture idempotency gate: FAIL (rc=${rc}) ==" >&2
  echo "-- git status -sb" >&2
  git status -sb >&2 || true
  echo "-- git diff --name-only" >&2
  git diff --name-only >&2 || true
  echo "-- git diff --stat" >&2
  git diff --stat >&2 || true
  if ! git diff --quiet; then
    echo "-- git diff (first 200 lines)" >&2
    git --no-pager diff | sed -n '1,200p' >&2 || true
  fi
  exit "$rc"
}

on_err() {
  rc="$?"
  fail_diag "$rc"
}
trap on_err ERR

assert_clean_tree() {
  git diff --exit-code
  test -z "$(git status --porcelain=v1)"
}

if [ -n "$(git status --porcelain=v1)" ]; then
  echo "Working tree must be clean before running this gate." >&2
  git status -sb >&2 || true
  exit 1
fi

export PATH="$PWD/local-tools/bin:$PATH"
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"

run_once() {
  npm run -s ingest:agriculture:with-previous
  npm run -s validate:rich
  npm run -s validate:lean
  npm run -s validate:offline
  assert_clean_tree
}

run_once
run_once

echo "== agriculture idempotency gate: OK =="

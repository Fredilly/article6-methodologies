#!/usr/bin/env bash
set -euo pipefail

usage() {
  if [[ -n "${1:-}" ]]; then
    echo "${1}" >&2
    echo >&2
  fi
  cat >&2 <<'EOF'
Usage:
  scripts/ci-idempotency.sh --sector <agriculture|forestry> [--program UNFCCC]

Options:
  --sector   Required. One of: agriculture, forestry
  --program  Optional. Default: UNFCCC (only supported value)
  --help     Show this help
EOF
}

sector=""
program="UNFCCC"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --sector)
      sector="${2:-}"
      shift 2
      ;;
    --program)
      program="${2:-}"
      shift 2
      ;;
    *)
      usage "Unknown arg: $1"
      exit 2
      ;;
  esac
done

if [[ -z "${sector}" ]]; then
  usage "Missing required arg: --sector"
  exit 2
fi

case "${sector}" in
  agriculture|forestry)
    ;;
  *)
    usage "Invalid --sector value: ${sector}"
    exit 2
    ;;
esac

case "${program}" in
  UNFCCC)
    ;;
  *)
    usage "Invalid --program value: ${program}"
    exit 2
    ;;
esac

gate_name="${sector}"

if [[ "${sector}" == "forestry" ]]; then
  gate_name="forestry"
else
  gate_name="agriculture"
fi

if [[ "${sector}" == "forestry" ]]; then
  set -x
fi

fail_diag() {
  rc="${1:-1}"
  if [[ "${sector}" == "forestry" ]]; then
    set +x
  fi
  echo "== ${gate_name} idempotency gate: FAIL (rc=${rc}) ==" >&2
  if [[ "${sector}" == "forestry" ]]; then
    echo "-- git status --porcelain" >&2
    git status --porcelain=v1 >&2 || true
  else
    echo "-- git status -sb" >&2
    git status -sb >&2 || true
  fi
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

if [[ -n "$(git status --porcelain=v1)" ]]; then
  echo "Working tree must be clean before running this gate." >&2
  if [[ "${sector}" == "forestry" ]]; then
    fail_diag 2
  else
    git status -sb >&2 || true
    exit 1
  fi
fi

export PATH="$PWD/local-tools/bin:$PATH"
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"

run_once() {
  npm run -s "ingest:${sector}:with-previous"
  npm run -s validate:rich
  npm run -s validate:lean
  npm run -s validate:offline
  assert_clean_tree
}

run_once
run_once

echo "== ${gate_name} idempotency gate: OK =="

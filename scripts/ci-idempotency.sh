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
CURRENT_PHASE="preflight"
sector_dir=""
case "${sector}" in
  agriculture)
    sector_dir="Agriculture"
    ;;
  forestry)
    sector_dir="Forestry"
    ;;
esac
readonly SCOPE_PATHS=(
  "methodologies/${program}/${sector_dir}"
  "tools/${program}/${sector_dir}"
  "registry/${program}/${sector_dir}"
  "ingest.${sector}.yml"
  "scripts"
  "core"
  "schemas"
  "package.json"
  "package-lock.json"
)

phase() {
  CURRENT_PHASE="$1"
  echo "== ${gate_name} idempotency phase: ${CURRENT_PHASE} =="
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[idempotency:${gate_name}] missing required command: $1" >&2
    exit 2
  }
}

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
  echo "== ${gate_name} idempotency gate: FAIL phase=${CURRENT_PHASE} rc=${rc} ==" >&2
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
  git diff --exit-code -- "${SCOPE_PATHS[@]}"
  test -z "$(git status --porcelain=v1 -- "${SCOPE_PATHS[@]}")"
}

if [[ -n "$(git status --porcelain=v1 -- "${SCOPE_PATHS[@]}")" ]]; then
  echo "Working tree must be clean in scope before running this gate." >&2
  if [[ "${sector}" == "forestry" ]]; then
    fail_diag 2
  else
    git status -sb -- "${SCOPE_PATHS[@]}" >&2 || true
    exit 1
  fi
fi

export PATH="$PWD/local-tools/bin:$PATH"
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
phase "preflight:commands"
need_cmd bash
need_cmd git
need_cmd node
need_cmd npm
need_cmd yq
need_cmd jq

run_once() {
  local run_label="$1"
  phase "${run_label}:ingest"
  npm run -s "ingest:${sector}:with-previous"
  phase "${run_label}:validate-rich"
  npm run -s validate:rich
  phase "${run_label}:validate-lean"
  npm run -s validate:lean
  phase "${run_label}:validate-offline"
  npm run -s validate:offline
  phase "${run_label}:assert-clean"
  assert_clean_tree
}

run_once "run1"
run_once "run2"

echo "== ${gate_name} idempotency gate: OK =="

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "$#" -lt 1 ]; then
  echo "Usage: scripts/ingest-scoped.sh <ingest-yml>"
  exit 1
fi

INGEST_YML="$1"
RUNS="${SCOPED_INGEST_RUNS:-1}"
IDEMPOTENT="${SCOPED_INGEST_ENFORCE_IDEMPOTENCY:-0}"

SCOPED_YML="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.scoped.XXXXXX")"
BASELINE_STATUS="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.baseline.status.XXXXXX")"
BASELINE_DIFF="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.baseline.diff.XXXXXX")"
BASELINE_CACHED_DIFF="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.baseline.cached.XXXXXX")"
cleanup() { rm -f "$SCOPED_YML" "$BASELINE_STATUS" "$BASELINE_DIFF" "$BASELINE_CACHED_DIFF"; }
trap cleanup EXIT

if ! [[ "$RUNS" =~ ^[0-9]+$ ]]; then
  echo "[ingest-scoped] invalid SCOPED_INGEST_RUNS value: ${RUNS}"
  exit 1
fi
if [ "$RUNS" -lt 1 ]; then
  echo "[ingest-scoped] SCOPED_INGEST_RUNS must be >= 1"
  exit 1
fi

pushd "$REPO_ROOT" >/dev/null

if [ ! -f "$INGEST_YML" ]; then
  echo "[ingest-scoped] ingest file not found: $INGEST_YML" >&2
  exit 2
fi

if [ ! -f "registry.json" ]; then
  echo "[ingest-scoped] missing required artefact: registry.json" >&2
  exit 2
fi

echo "[ingest-scoped] parse check"
node "${SCRIPT_DIR}/check-ingest-yml.mjs" "$INGEST_YML" >/dev/null

git status --porcelain=v1 -z > "$BASELINE_STATUS"
git diff > "$BASELINE_DIFF"
git diff --cached > "$BASELINE_CACHED_DIFF"

node "${SCRIPT_DIR}/resolve-ingest-scope.mjs" \
  --source ingest \
  --in "$INGEST_YML" \
  --out "$SCOPED_YML" \
  --assert-sector true

for ((run=1; run<=RUNS; run++)); do
  echo "[ingest-scoped] run ${run}/${RUNS} ingest=${INGEST_YML}"
  scoped_method_dirs=()
  while IFS= read -r line; do
    [ -n "$line" ] && scoped_method_dirs+=("$line")
  done < <(node "${SCRIPT_DIR}/ingest-scope-paths.mjs" --ingest-yml "$SCOPED_YML" --kind methodologies-dirs)

  has_agriculture=0
  has_forestry=0
  for d in "${scoped_method_dirs[@]}"; do
    [[ "$d" == *"/Agriculture/"* ]] && has_agriculture=1
    [[ "$d" == *"/Forestry/"* ]] && has_forestry=1
  done

  scoped_dry_run=0
  if [ "$has_agriculture" -eq 0 ] && [ "$has_forestry" -eq 1 ]; then
    scoped_dry_run=1
    echo "[ingest-scoped] forestry-only scope detected → DRY_RUN=1 (guardrails only; no regeneration)"
  fi

  DRY_RUN="$scoped_dry_run" RUN_VALIDATE=0 INGEST_FILE="$SCOPED_YML" bash "${SCRIPT_DIR}/ingest.sh"

  agri_dirs=()
  for d in "${scoped_method_dirs[@]}"; do
    [[ "$d" == *"/Agriculture/"* ]] && agri_dirs+=("$d")
  done
  if [ "$scoped_dry_run" -eq 0 ] && [ "${#agri_dirs[@]}" -gt 0 ] && [ -f "${SCRIPT_DIR}/reshape-agriculture.js" ]; then
    echo "[ingest-scoped] reshape-agriculture (scoped)"
    node "${SCRIPT_DIR}/reshape-agriculture.js" "${agri_dirs[@]}"
  fi

  node "${SCRIPT_DIR}/resolve-ingest-scope.mjs" \
    --source ingest \
    --in "$SCOPED_YML" \
    --out "$SCOPED_YML" \
    --assert-sector true \
    --assert-existing true
  echo "[ingest-scoped] refresh META hashes (scoped)"
  bash "${SCRIPT_DIR}/hash-all.sh" --ingest-yml "$SCOPED_YML"
  echo "[ingest-scoped] gen-registry"
  node "${SCRIPT_DIR}/gen-registry.js" --ingest-yml "$SCOPED_YML"
  echo "[ingest-scoped] registry scope gate"
  node "${SCRIPT_DIR}/check-registry-scope.mjs" \
    --ingest-yml "$SCOPED_YML" \
    --baseline-status "$BASELINE_STATUS"
  if [ "$scoped_dry_run" -eq 0 ]; then
    echo "[ingest-scoped] canonical-json (scoped)"
    roots="$(node "${SCRIPT_DIR}/ingest-scope-paths.mjs" --ingest-yml "$SCOPED_YML" --kind methodologies-dirs --sep ',')"
    ./scripts/json-canonical-check.sh --fix --roots="${roots%,}"
    ./scripts/json-canonical-check.sh --roots="${roots%,}"
  else
    echo "[ingest-scoped] skip: canonical-json (forestry-only DRY_RUN)"
  fi
  echo "[ingest-scoped] validations (rich)"
  npm run -s validate:rich
  echo "[ingest-scoped] validations (lean)"
  npm run -s validate:lean
  echo "[ingest-scoped] quality gates"
  node "${SCRIPT_DIR}/check-quality-gates.js" ingest-quality-gates.yml
  echo "[ingest-scoped] scope drift gate"
  node "${SCRIPT_DIR}/check-scope-drift.mjs" \
    --ingest-yml "$SCOPED_YML" \
    --allow registry.json \
    --baseline-status "$BASELINE_STATUS"
done

if [ "$IDEMPOTENT" = "1" ]; then
  echo "[ingest-scoped] enforcing zero net diffs vs baseline"
  tmp_diff="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.current.diff.XXXXXX")"
  tmp_cached="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.current.cached.XXXXXX")"
  git diff > "$tmp_diff"
  git diff --cached > "$tmp_cached"
  if ! cmp -s "$BASELINE_DIFF" "$tmp_diff"; then
    echo "[ingest-scoped] FAIL: working tree diff changed vs baseline" >&2
    rm -f "$tmp_diff" "$tmp_cached"
    exit 1
  fi
  if ! cmp -s "$BASELINE_CACHED_DIFF" "$tmp_cached"; then
    echo "[ingest-scoped] FAIL: index diff changed vs baseline" >&2
    rm -f "$tmp_diff" "$tmp_cached"
    exit 1
  fi
  rm -f "$tmp_diff" "$tmp_cached"
  echo "[ingest-scoped] final scope drift gate"
  node "${SCRIPT_DIR}/check-scope-drift.mjs" \
    --ingest-yml "$SCOPED_YML" \
    --allow registry.json \
    --baseline-status "$BASELINE_STATUS"
fi

if [ "${ARTICLE6_WORKSTATE:-0}" = "1" ]; then
  node "${SCRIPT_DIR}/workstate-update.mjs" --task "ingest:scoped" --scope "$INGEST_YML"
fi

popd >/dev/null

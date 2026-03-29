#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CURRENT_PHASE="preflight"

phase() {
  CURRENT_PHASE="$1"
  echo "[ingest-scoped] phase=${CURRENT_PHASE}"
}

die() {
  echo "[ingest-scoped] ${CURRENT_PHASE}: $1" >&2
  exit "${2:-1}"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1" 2
}

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
RUN1_DIFF="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.run1.diff.XXXXXX")"
RUN1_CACHED_DIFF="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.run1.cached.XXXXXX")"
cleanup() { rm -f "$SCOPED_YML" "$BASELINE_STATUS" "$BASELINE_DIFF" "$BASELINE_CACHED_DIFF" "$RUN1_DIFF" "$RUN1_CACHED_DIFF"; }
trap cleanup EXIT
trap 'rc=$?; if [ "$rc" -ne 0 ]; then echo "[ingest-scoped] FAIL phase=${CURRENT_PHASE} rc=${rc}" >&2; fi' ERR

if ! [[ "$RUNS" =~ ^[0-9]+$ ]]; then
  echo "[ingest-scoped] invalid SCOPED_INGEST_RUNS value: ${RUNS}"
  exit 1
fi
if [ "$RUNS" -lt 1 ]; then
  echo "[ingest-scoped] SCOPED_INGEST_RUNS must be >= 1"
  exit 1
fi
if [ "$IDEMPOTENT" = "1" ] && [ "$RUNS" -lt 2 ]; then
  echo "[ingest-scoped] SCOPED_INGEST_ENFORCE_IDEMPOTENCY=1 requires SCOPED_INGEST_RUNS >= 2" >&2
  exit 2
fi

pushd "$REPO_ROOT" >/dev/null

phase "preflight"
need_cmd bash
need_cmd git
need_cmd jq
need_cmd node
need_cmd npm
need_cmd yq

[ -f "$INGEST_YML" ] || die "ingest file not found: $INGEST_YML" 2
[ -f "registry.json" ] || die "missing required artefact: registry.json" 2
[ -f "${SCRIPT_DIR}/ingest.sh" ] || die "missing required script: scripts/ingest.sh" 2
[ -f "${SCRIPT_DIR}/check-scope-drift.mjs" ] || die "missing required script: scripts/check-scope-drift.mjs" 2

echo "[ingest-scoped] parse check: ${INGEST_YML}"
node "${SCRIPT_DIR}/check-ingest-yml.mjs" "$INGEST_YML" >/dev/null
phase "preflight:resolve-scope"
node "${SCRIPT_DIR}/resolve-ingest-scope.mjs" \
  --source ingest \
  --in "$INGEST_YML" \
  --out "$SCOPED_YML" \
  --assert-sector true

scoped_method_dirs=()
while IFS= read -r line; do
  [ -n "$line" ] && scoped_method_dirs+=("$line")
done < <(node "${SCRIPT_DIR}/ingest-scope-paths.mjs" --ingest-yml "$SCOPED_YML" --kind methodologies-dirs)
if [ "${#scoped_method_dirs[@]}" -eq 0 ]; then
  die "scope resolved to zero methodology directories: ${INGEST_YML}" 2
fi

git status --porcelain=v1 -z > "$BASELINE_STATUS"
git diff > "$BASELINE_DIFF"
git diff --cached > "$BASELINE_CACHED_DIFF"

for ((run=1; run<=RUNS; run++)); do
  echo "[ingest-scoped] run ${run}/${RUNS} ingest=${INGEST_YML}"
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

  phase "generation:ingest"
  DRY_RUN="$scoped_dry_run" RUN_VALIDATE=0 INGEST_FILE="$SCOPED_YML" bash "${SCRIPT_DIR}/ingest.sh"

  agri_dirs=()
  forestry_dirs=()
  for d in "${scoped_method_dirs[@]}"; do
    [[ "$d" == *"/Agriculture/"* ]] && agri_dirs+=("$d")
    [[ "$d" == *"/Forestry/"* ]] && forestry_dirs+=("$d")
  done
  if [ "$scoped_dry_run" -eq 0 ] && [ "${#agri_dirs[@]}" -gt 0 ] && [ -f "${SCRIPT_DIR}/reshape-agriculture.js" ]; then
    phase "generation:reshape-agriculture"
    echo "[ingest-scoped] reshape-agriculture (scoped)"
    node "${SCRIPT_DIR}/reshape-agriculture.js" "${agri_dirs[@]}"
  fi

  if [ "${ARTICLE6_INCLUDE_PREVIOUS:-0}" = "1" ] && { [ "${#agri_dirs[@]}" -gt 0 ] || [ "${#forestry_dirs[@]}" -gt 0 ]; }; then
    if [ -z "${ARTICLE6_PREVIOUS_LOCK:-}" ]; then
      die "ARTICLE6_INCLUDE_PREVIOUS=1 requires ARTICLE6_PREVIOUS_LOCK=<path>" 2
    fi
    phase "generation:previous"
    echo "[ingest-scoped] include previous versions from lockfile"
    node "${SCRIPT_DIR}/ingest-previous-from-lock.mjs" \
      --ingest-yml "$SCOPED_YML" \
      --previous-lock "${ARTICLE6_PREVIOUS_LOCK}"
  fi

  phase "drift:post-generation"
  node "${SCRIPT_DIR}/check-scope-drift.mjs" \
    --ingest-yml "$SCOPED_YML" \
    --allow scripts_manifest.json \
    --allow registry.json \
    --baseline-status "$BASELINE_STATUS"

  phase "preflight:assert-existing"
  node "${SCRIPT_DIR}/resolve-ingest-scope.mjs" \
    --source ingest \
    --in "$SCOPED_YML" \
    --out "$SCOPED_YML" \
    --assert-sector true \
    --assert-existing true
  phase "generation:hash-all"
  echo "[ingest-scoped] refresh META hashes (scoped)"
  bash "${SCRIPT_DIR}/hash-all.sh" --ingest-yml "$SCOPED_YML"
  phase "generation:registry"
  echo "[ingest-scoped] gen-registry"
  node "${SCRIPT_DIR}/gen-registry.js" --ingest-yml "$SCOPED_YML"
  phase "drift:registry-scope"
  echo "[ingest-scoped] registry scope gate"
  node "${SCRIPT_DIR}/check-registry-scope.mjs" \
    --ingest-yml "$SCOPED_YML" \
    --baseline-status "$BASELINE_STATUS"
  if [ "$scoped_dry_run" -eq 0 ]; then
    phase "canonical-json"
    echo "[ingest-scoped] canonical-json (scoped)"
    roots="$(node "${SCRIPT_DIR}/ingest-scope-paths.mjs" --ingest-yml "$SCOPED_YML" --kind methodologies-dirs --sep ',')"
    ./scripts/json-canonical-check.sh --fix --roots="${roots%,}"
    ./scripts/json-canonical-check.sh --roots="${roots%,}"
  else
    echo "[ingest-scoped] skip: canonical-json (forestry-only DRY_RUN)"
  fi
  phase "validate:rich"
  echo "[ingest-scoped] validations (rich)"
  npm run -s validate:rich
  phase "validate:lean"
  echo "[ingest-scoped] validations (lean)"
  npm run -s validate:lean
  phase "quality-gates"
  echo "[ingest-scoped] quality gates"
  node "${SCRIPT_DIR}/check-quality-gates.js" ingest-quality-gates.yml
  phase "drift:scope"
  echo "[ingest-scoped] scope drift gate"
  node "${SCRIPT_DIR}/check-scope-drift.mjs" \
    --ingest-yml "$SCOPED_YML" \
    --allow scripts_manifest.json \
    --allow registry.json \
    --baseline-status "$BASELINE_STATUS"

  if [ "$IDEMPOTENT" = "1" ] && [ "$run" -eq 1 ]; then
    git diff > "$RUN1_DIFF"
    git diff --cached > "$RUN1_CACHED_DIFF"
  fi
done

if [ "$IDEMPOTENT" = "1" ]; then
  phase "idempotency:compare-run-diffs"
  echo "[ingest-scoped] enforcing stable diffs across runs (run1 vs final)"
  tmp_diff="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.current.diff.XXXXXX")"
  tmp_cached="$(mktemp "${TMPDIR:-/tmp}/article6.ingest.current.cached.XXXXXX")"
  git diff > "$tmp_diff"
  git diff --cached > "$tmp_cached"
  if ! cmp -s "$RUN1_DIFF" "$tmp_diff"; then
    echo "[ingest-scoped] idempotency: working tree diff changed between runs" >&2
    rm -f "$tmp_diff" "$tmp_cached"
    exit 1
  fi
  if ! cmp -s "$RUN1_CACHED_DIFF" "$tmp_cached"; then
    echo "[ingest-scoped] idempotency: index diff changed between runs" >&2
    rm -f "$tmp_diff" "$tmp_cached"
    exit 1
  fi
  rm -f "$tmp_diff" "$tmp_cached"
  phase "drift:final-scope"
  echo "[ingest-scoped] final scope drift gate"
  node "${SCRIPT_DIR}/check-scope-drift.mjs" \
    --ingest-yml "$SCOPED_YML" \
    --allow scripts_manifest.json \
    --allow registry.json \
    --baseline-status "$BASELINE_STATUS"
fi

if [ "${ARTICLE6_WORKSTATE:-0}" = "1" ]; then
  node "${SCRIPT_DIR}/workstate-update.mjs" --task "ingest:scoped" --scope "$INGEST_YML"
fi

popd >/dev/null

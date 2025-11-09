#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ALLOW_NO_LFS="${A6_ALLOW_NO_LFS:-0}"

have_git_lfs() {
  git lfs --version >/dev/null 2>&1
}

pointer_check() {
  local file="$1"
  if [[ ! -s "$file" ]]; then
    echo "[gate-lfs] empty file: $file" >&2
    return 1
  fi
  local header
  header=$(head -n1 "$file" 2>/dev/null || true)
  if [[ "$header" != "version https://git-lfs.github.com/spec/v1" ]]; then
    echo "[gate-lfs] not a git-lfs pointer (missing header): $file" >&2
    return 1
  fi
  local oid_line size_line
  oid_line=$(grep -m1 '^oid sha256:' "$file" || true)
  size_line=$(grep -m1 '^size ' "$file" || true)
  if [[ -z "$oid_line" || -z "$size_line" ]]; then
    echo "[gate-lfs] incomplete pointer (missing oid/size): $file" >&2
    return 1
  fi
  return 0
}

pointer_scan() {
  local errors=0
  while IFS= read -r -d '' f; do
    if ! pointer_check "$f"; then
      errors=$((errors + 1))
    fi
  done < <(find tools/UNFCCC/Forestry methodologies/UNFCCC/Forestry -type f -name '*.pdf' ! -path '*/previous/*' -print0 2>/dev/null)
  if [[ $errors -gt 0 ]]; then
    echo "[gate-lfs] pointer scan found $errors issue(s)" >&2
    return 1
  fi
  echo "[gate-lfs] pointer scan OK"
}

if have_git_lfs; then
  echo "[gate-lfs] git lfs available; verifying tracked files"
  git lfs ls-files --all --long | grep -E ' (tools/UNFCCC|methodologies/UNFCCC/Forestry)/' || {
    echo "[gate-lfs] no Forestry files tracked via git-lfs" >&2
    exit 1
  }
else
  if [[ "$ALLOW_NO_LFS" != "1" ]]; then
    echo "[gate-lfs] git lfs not available and A6_ALLOW_NO_LFS is not set" >&2
    exit 1
  fi
  echo "[gate-lfs] git lfs not available; falling back to pointer validation (A6_ALLOW_NO_LFS=1)"
fi

pointer_scan

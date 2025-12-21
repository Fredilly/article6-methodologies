#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SELF_REL="scripts/check-root-cause-index-path.sh"

search_repo() {
  local needle="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -n --fixed-strings "$needle" "$ROOT" --glob "!$SELF_REL"
    return
  fi

  if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT" grep -n -F "$needle" -- . ":!$SELF_REL"
    return
  fi

  # Portable fallback for environments without rg/git.
  grep -R -n -F --exclude="$(basename "$SELF_REL")" "$needle" "$ROOT"
}

search_file_fixed() {
  local needle="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -n --fixed-strings "$needle" "$file"
  else
    grep -n -F "$needle" "$file"
  fi
}

if search_repo 'docs/ROOT_CAUSE_INDEX.md' >/dev/null; then
  echo "[root-cause:index-path] FAIL: found stale reference to docs/ROOT_CAUSE_INDEX.md" >&2
  echo "[root-cause:index-path] Hint: use docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md" >&2
  search_repo 'docs/ROOT_CAUSE_INDEX.md' >&2 || true
  exit 1
fi

EXPECTED="docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md"
GEN="$ROOT/scripts/gen-root-cause-index.mjs"
if [ ! -f "$GEN" ]; then
  echo "[root-cause:index-path] FAIL: missing generator script at scripts/gen-root-cause-index.mjs" >&2
  exit 1
fi

if ! search_file_fixed "$EXPECTED" "$GEN" >/dev/null; then
  echo "[root-cause:index-path] FAIL: generator does not contain expected output path: $EXPECTED" >&2
  echo "[root-cause:index-path] File: scripts/gen-root-cause-index.mjs" >&2
  exit 1
fi

echo "[root-cause:index-path] ok"

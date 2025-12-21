#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

STALE_PREFIX="docs/ROOT_CAUSE_INDEX"
STALE_SUFFIX=".md"
STALE="${STALE_PREFIX}${STALE_SUFFIX}"

matches=""
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  matches="$(git -C "$ROOT" grep -n -F "$STALE" -- . || true)"
else
  matches="$(grep -R -n -F "$STALE" "$ROOT" || true)"
fi
matches="$(printf '%s\n' "$matches" | grep -v '^scripts/check-root-cause-index-path\.sh:' || true)"

if [ -n "$matches" ]; then
  echo "[root-cause:index-path] FAIL: found stale reference to ${STALE}" >&2
  echo "[root-cause:index-path] Hint: use docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md" >&2
  printf '%s\n' "$matches" >&2
  exit 1
fi

EXPECTED="docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md"
GEN="$ROOT/scripts/gen-root-cause-index.mjs"
if [ ! -f "$GEN" ]; then
  echo "[root-cause:index-path] FAIL: missing generator script at scripts/gen-root-cause-index.mjs" >&2
  exit 1
fi

if ! grep -Fq "$EXPECTED" "$GEN"; then
  echo "[root-cause:index-path] FAIL: generator does not contain expected output path: $EXPECTED" >&2
  echo "[root-cause:index-path] File: scripts/gen-root-cause-index.mjs" >&2
  exit 1
fi

echo "[root-cause:index-path] ok"

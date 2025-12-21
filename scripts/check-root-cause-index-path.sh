#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SELF_REL="scripts/check-root-cause-index-path.sh"

if rg -n 'docs/ROOT_CAUSE_INDEX\.md' "$ROOT" --glob "!$SELF_REL" >/dev/null; then
  echo "[root-cause:index-path] FAIL: found stale reference to docs/ROOT_CAUSE_INDEX.md" >&2
  echo "[root-cause:index-path] Hint: use docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md" >&2
  rg -n 'docs/ROOT_CAUSE_INDEX\.md' "$ROOT" --glob "!$SELF_REL" >&2 || true
  exit 1
fi

EXPECTED="docs/projects/phase-1-ingestion/ROOT_CAUSE_INDEX.md"
GEN="$ROOT/scripts/gen-root-cause-index.mjs"
if [ ! -f "$GEN" ]; then
  echo "[root-cause:index-path] FAIL: missing generator script at scripts/gen-root-cause-index.mjs" >&2
  exit 1
fi

if ! rg -n --fixed-strings "$EXPECTED" "$GEN" >/dev/null; then
  echo "[root-cause:index-path] FAIL: generator does not contain expected output path: $EXPECTED" >&2
  echo "[root-cause:index-path] File: scripts/gen-root-cause-index.mjs" >&2
  exit 1
fi

echo "[root-cause:index-path] ok"

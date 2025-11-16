#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

pushd "$REPO_ROOT" >/dev/null

if [ ! -f package-lock.json ]; then
  echo "[sanity] npm lockfile missing; run npm install first" >&2
  exit 1
fi

echo "[sanity] npm ci"
npm ci

echo "[sanity] DRY_RUN=1 npm run ingest:full -- ingest.forestry.yml"
DRY_RUN=1 npm run ingest:full -- ingest.forestry.yml

echo "[sanity] npm run validate:rich"
npm run validate:rich

echo "[sanity] npm run validate:lean"
npm run validate:lean

echo "[sanity] scanning methodologies for TODO/stub placeholders"
if rg -n --color=never -e 'TODO' -e 'stub' -e '"content":\s*""' methodologies; then
  echo "[sanity] placeholder content detected; failing" >&2
  exit 2
fi

echo "[sanity] scanning methodologies for empty titles"
if rg -n --color=never -e '"title":\s*""' methodologies; then
  echo "[sanity] empty titles detected; failing" >&2
  exit 3
fi

echo "[sanity] ✔ ingest outputs look clean"
popd >/dev/null

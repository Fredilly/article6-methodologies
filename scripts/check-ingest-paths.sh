#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INGEST_FILES=("$@")
if [ "${#INGEST_FILES[@]}" -eq 0 ]; then
  default_files=("ingest.forestry.yml" "ingest.agriculture.yml")
  for file in "${default_files[@]}"; do
    if [ -f "${REPO_ROOT}/${file}" ]; then
      INGEST_FILES+=("$file")
    fi
  done
fi

if [ "${#INGEST_FILES[@]}" -eq 0 ]; then
  echo "[check-ingest-paths] no ingest files provided or found (expected ingest.forestry.yml or ingest.agriculture.yml)" >&2
  exit 1
fi

pushd "$REPO_ROOT" >/dev/null

if ! git diff --quiet --stat --exit-code; then
  echo "[check-ingest-paths] working tree is dirty; please commit or stash changes before running this sanity check" >&2
  exit 2
fi

for ingest_file in "${INGEST_FILES[@]}"; do
  if [ ! -f "$ingest_file" ]; then
    echo "[check-ingest-paths] skipping missing ingest file: $ingest_file"
    continue
  fi
  echo "[check-ingest-paths] running ingest for $ingest_file"
  npm run ingest:full -- "$ingest_file" --offline
done

invalid_paths=()
while IFS= read -r line; do
  status="${line:0:2}"
  file_path="${line:3}"
  case "$file_path" in
    methodologies/*)
      if [[ ! "$file_path" =~ ^methodologies/UNFCCC/[A-Za-z0-9._-]+/[A-Za-z0-9.-]+/v[0-9]{2}-[0-9]+/ ]]; then
        invalid_paths+=("$file_path")
      fi
      ;;
    tools/*)
      if [[ ! "$file_path" =~ ^tools/UNFCCC/[A-Za-z0-9._-]+/[A-Za-z0-9.-]+/v[0-9]{2}-[0-9]+/ ]]; then
        invalid_paths+=("$file_path")
      fi
      ;;
    *)
      ;;
  esac
done < <(git status -sb)

if [ "${#invalid_paths[@]}" -gt 0 ]; then
  echo "[check-ingest-paths] Non-canonical paths detected:"
  for path in "${invalid_paths[@]}"; do
    echo " - $path"
  done
  echo "[check-ingest-paths] Please investigate the ingest output above."
  exit 3
fi

echo "[check-ingest-paths] ✔ all methodologies/ and tools/ changes follow the canonical layout"
popd >/dev/null

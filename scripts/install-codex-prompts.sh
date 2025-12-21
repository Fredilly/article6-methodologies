#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/tools/codex-prompts"
DST_DIR="${HOME}/.codex/prompts"

mkdir -p "$DST_DIR"

shopt -s nullglob
prompts=("$SRC_DIR"/*.md)
shopt -u nullglob

if [ "${#prompts[@]}" -eq 0 ]; then
  echo "[codex-prompts] no prompt files found in $SRC_DIR"
  exit 0
fi

for src in "${prompts[@]}"; do
  base="$(basename "$src")"
  cp -f "$src" "$DST_DIR/$base"
done

echo "[codex-prompts] installed ${#prompts[@]} prompt(s) to $DST_DIR"


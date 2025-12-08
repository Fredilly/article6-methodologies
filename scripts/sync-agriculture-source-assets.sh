#!/usr/bin/env bash
set -euo pipefail

echo "[sync-agriculture-source-assets] Mirroring tools → source-assets for UNFCCC Agriculture…"

# For EVERY Agriculture version:
# tools/UNFCCC/Agriculture/<Code>/vVV-0/source.pdf
# → source-assets/UNFCCC/Agriculture/<Code>/vVV-0/source.pdf

find tools/UNFCCC/Agriculture -type f -name 'source.pdf' | while read -r tools_pdf; do
  rel="${tools_pdf#tools/}"               # UNFCCC/Agriculture/.../source.pdf
  target="source-assets/${rel}"           # source-assets/UNFCCC/Agriculture/.../source.pdf

  mkdir -p "$(dirname "$target")"
  cp "$tools_pdf" "$target"
  echo "  synced: $tools_pdf -> $target"
done

echo "[sync-agriculture-source-assets] Done."

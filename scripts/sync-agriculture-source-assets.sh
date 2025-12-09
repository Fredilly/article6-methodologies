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

  # Legacy versions may only exist under tools/.../previous/<version>/tools/source.pdf.
  # Mirror them into source-assets/UNFCCC/Agriculture/<Code>/<version>/source.pdf so ingest can find them.
  if [[ "$tools_pdf" == */previous/*/tools/source.pdf ]]; then
    path_tail="${tools_pdf#tools/UNFCCC/Agriculture/}"  # e.g. ACM0010/v03-0/previous/v01-0/tools/source.pdf
    method="${path_tail%%/*}"                           # ACM0010
    remainder="${path_tail#*/}"                         # v03-0/previous/v01-0/tools/source.pdf
    prev_version="${remainder#*/previous/}"             # v01-0/tools/source.pdf
    prev_version="${prev_version%%/*}"                  # v01-0
    legacy_target="source-assets/UNFCCC/Agriculture/${method}/${prev_version}/source.pdf"
    mkdir -p "$(dirname "$legacy_target")"
    cp "$tools_pdf" "$legacy_target"
    echo "  synced legacy: $tools_pdf -> $legacy_target"
  fi
done

echo "[sync-agriculture-source-assets] Done."

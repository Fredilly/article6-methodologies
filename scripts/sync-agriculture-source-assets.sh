#!/usr/bin/env bash
set -euo pipefail

echo "[sync-agriculture-source-assets] Mirroring tools → source-assets for UNFCCC Agriculture…"

# For EVERY Agriculture version, copy the authoritative PDF from tools to source-assets
find tools/UNFCCC/Agriculture -type f -name 'source.pdf' | while read -r tools_pdf; do
  # tools_pdf: tools/UNFCCC/Agriculture/ACM0010/v03-0/source.pdf
  rel="${tools_pdf#tools/}"                     # UNFCCC/Agriculture/ACM0010/v03-0/source.pdf
  target="source-assets/${rel}"                 # source-assets/UNFCCC/Agriculture/ACM0010/v03-0/source.pdf

  mkdir -p "$(dirname "$target")"
  cp "$tools_pdf" "$target"
  echo "  synced: $tools_pdf -> $target"

  # Some archived versions live under tools/.../previous/<version>/tools/source.pdf
  # Mirror those into the canonical source-assets/<method>/<version>/source.pdf location.
  if [[ "$tools_pdf" == */previous/*/tools/source.pdf ]]; then
    method_version="${tools_pdf#tools/UNFCCC/Agriculture/}" # e.g. ACM0010/v03-0/previous/v01-0/tools/source.pdf
    method="${method_version%%/*}"                          # ACM0010
    remainder="${method_version#*/}"                        # v03-0/previous/v01-0/tools/source.pdf
    prev_version="${remainder#*/previous/}"                 # v01-0/tools/source.pdf
    prev_version="${prev_version%%/*}"                      # v01-0
    legacy_target="source-assets/UNFCCC/Agriculture/${method}/${prev_version}/source.pdf"
    mkdir -p "$(dirname "$legacy_target")"
    cp "$tools_pdf" "$legacy_target"
    echo "  synced legacy: $tools_pdf -> $legacy_target"
  fi
done

echo "[sync-agriculture-source-assets] Done."

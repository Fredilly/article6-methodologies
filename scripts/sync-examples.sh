#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMPLATES="$ROOT/templates"
DOCS="$ROOT/docs/examples"
mkdir -p "$DOCS"
for f in "$TEMPLATES"/*.template.json; do
  base=$(basename "$f")
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  {
    echo "// checksum: $sha"
    cat "$f"
  } > "$DOCS/$base"
done

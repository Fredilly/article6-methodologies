#!/usr/bin/env bash
set -euo pipefail

SHA="$(git rev-parse --short=12 HEAD)"
OUT="artifacts/methodologies-pack-${SHA}.tar.gz"
TMP=".cache/pack-${SHA}"

rm -rf "$TMP"
mkdir -p "$TMP/methodologies-pack"

# Copy only what the UI needs. Keep directory structure.
# 1) methodologies subtree
rsync -a --prune-empty-dirs \
  --include='*/' \
  --include='META.json' \
  --include='rules.json' \
  --include='sections.json' \
  --include='rich.json' \
  --include='*.rich.json' \
  --exclude='*' \
  methodologies/ "$TMP/methodologies-pack/methodologies/"

# 2) include registry + manifest if they exist (safe no-op)
if [[ -d registry ]]; then rsync -a registry/ "$TMP/methodologies-pack/registry/"; fi
if [[ -d manifest ]]; then rsync -a manifest/ "$TMP/methodologies-pack/manifest/"; fi

# Add a provenance marker
cat > "$TMP/methodologies-pack/PROVENANCE.json" <<JSON
{
  "repo": "Fredilly/article6-methodologies",
  "sha": "$(git rev-parse HEAD)",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

# Create deterministic-ish tarball (GNU tar preferred; Codespaces has it)
TAR_BIN="tar"
if command -v gtar >/dev/null 2>&1; then
  TAR_BIN="gtar"
fi

if ! "$TAR_BIN" --help 2>/dev/null | rg -q -- '--sort'; then
  echo "❌ ${TAR_BIN} does not support --sort; run this script in Linux/Codespaces or install GNU tar (gtar)."
  exit 1
fi

"$TAR_BIN" --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -czf "$OUT" -C "$TMP" methodologies-pack

echo "✅ wrote $OUT"

#!/usr/bin/env bash
set -euo pipefail

SHA="$(git rev-parse --short=12 HEAD)"
OUT="artifacts/methodologies-pack-${SHA}.tar.gz"
TMP=".cache/pack-${SHA}"

iso_utc_from_epoch() {
  epoch="${1:-0}"
  if date -u -d "@${epoch}" +%Y-%m-%dT%H:%M:%SZ >/dev/null 2>&1; then
    date -u -d "@${epoch}" +%Y-%m-%dT%H:%M:%SZ
    return
  fi
  date -u -r "${epoch}" +%Y-%m-%dT%H:%M:%SZ
}

EPOCH="${SOURCE_DATE_EPOCH:-}"
if [[ -z "${EPOCH}" || "${EPOCH}" == "0" ]]; then
  EPOCH="$(git show -s --format=%ct HEAD)"
fi

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
  "generated_at": "$(iso_utc_from_epoch "$EPOCH")"
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

# Ensure the gzip wrapper does not embed timestamps/filenames (reproducible bytes).
export GZIP='-n'

"$TAR_BIN" --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -czf "$OUT" -C "$TMP" methodologies-pack

echo "✅ wrote $OUT"

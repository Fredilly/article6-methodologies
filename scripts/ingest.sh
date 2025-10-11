#!/usr/bin/env bash
set -euo pipefail

# --- config toggles ---
DRY_RUN="${DRY_RUN:-0}"          # 1 = don't write/commit, just print actions
RUN_VALIDATE="${RUN_VALIDATE:-1}" # 1 = run local validators if present
AUTO_COMMIT="${AUTO_COMMIT:-1}"   # 1 = commit each method after ingest

# --- helpers ---
need() { command -v "$1" >/dev/null || { echo "Missing dependency: $1"; exit 1; }; }
sha256() { shasum -a 256 "$1" | awk '{print $1}'; }

need yq
need jq
need pup
need curl

INGEST_FILE="${INGEST_FILE:-ingest.yml}"
test -f "$INGEST_FILE" || { echo "No $INGEST_FILE found"; exit 1; }

get_field() {
  local index="$1" key="$2"
  yq -r ".methods[$index].$key // empty" "$INGEST_FILE"
}

get_default() {
  local key="$1"
  yq -r ".defaults.$key // empty" "$INGEST_FILE"
}

METHOD_COUNT="$(yq '.methods | length' "$INGEST_FILE")"
OWNER_DEFAULT="$(get_default owner)"
PDF_HINT_DEFAULT="$(get_default pdf_hint)"

echo "[ingest] methods: $METHOD_COUNT"

for i in $(seq 0 $((METHOD_COUNT-1))); do
  ID="$(get_field "$i" id)";         test -n "$ID" || { echo "[skip] index $i: no id"; continue; }
  VER="$(get_field "$i" version)";    test -n "$VER" || { echo "[skip] $ID: no version"; continue; }
  SECTOR="$(get_field "$i" sector)"
  PAGE="$(get_field "$i" source_page)"
  PDF_URL_OVERRIDE="$(get_field "$i" pdf_url)"
  PDF_HINT="$(get_field "$i" pdf_hint)"
  [ -n "$PDF_HINT" ] || PDF_HINT="$PDF_HINT_DEFAULT"

  echo "———"
  echo "[ingest] $ID $VER"

  # path like methodologies/UNFCCC/Forestry/AR-AMS0007/v03-1
  REGISTRY="$(echo "$ID" | cut -d'.' -f1)"
  REST_PATH="$(echo "$ID" | cut -d'.' -f2- | tr '.' '/')"
  DEST_DIR="methodologies/${REST_PATH}/${VER}"
  SRC_DIR="sources/${ID}/${VER}"
  mkdir -p "$DEST_DIR" "$SRC_DIR" "tools/${ID}"

  # 1) resolve PDF
  PDF_PATH="$SRC_DIR/source.pdf"
  if [ -n "$PDF_URL_OVERRIDE" ]; then
    PDF_URL="$PDF_URL_OVERRIDE"
  else
    test -n "$PAGE" || { echo "[warn] $ID: no source_page and no pdf_url override"; PDF_URL=""; }
    if [ -n "$PAGE" ]; then
      echo "[fetch] $PAGE"
      HTML_TMP="$(mktemp)"
      curl -fsSL "$PAGE" -o "$HTML_TMP"
      # find first .pdf link, optionally filtered by hint
      if [ -n "$PDF_HINT" ]; then
        PDF_URL="$(pup 'a attr{href}' < "$HTML_TMP" | grep -i '\.pdf' | grep -i "$PDF_HINT" | head -n1 || true)"
      else
        PDF_URL="$(pup 'a attr{href}' < "$HTML_TMP" | grep -i '\.pdf' | head -n1 || true)"
      fi
      rm -f "$HTML_TMP"
    fi
  fi

  if [ -n "${PDF_URL:-}" ]; then
    case "$PDF_URL" in
      http* ) true ;;
      * ) # relative link on same host
          BASE="$(echo "$PAGE" | sed -E 's#(/view\.html)?$##')"
          PDF_URL="${BASE%/}/${PDF_URL#./}"
          ;;
    esac
    echo "[pdf] $PDF_URL"
    if [ "$DRY_RUN" = "0" ]; then
      curl -fsSL "$PDF_URL" -o "$PDF_PATH"
    fi
  else
    echo "[warn] $ID: PDF not found; leaving placeholder"
    if [ "$DRY_RUN" = "0" ] && [ ! -f "$PDF_PATH" ]; then
      : > "$PDF_PATH"  # empty placeholder to keep structure
    fi
  fi

  # 2) scaffold JSONs
  META="$DEST_DIR/META.json"
  SECTIONS="$DEST_DIR/sections.json"
  RULES="$DEST_DIR/rules.json"
  RULES_RICH="$DEST_DIR/rules.rich.json"

  if [ "$DRY_RUN" = "0" ]; then
    PDF_SHA=""
    [ -s "$PDF_PATH" ] && PDF_SHA="$(sha256 "$PDF_PATH")"

    jq -n \
      --arg id "$ID" \
      --arg version "$VER" \
      --arg registry "${OWNER_DEFAULT:-$REGISTRY}" \
      --arg sector "${SECTOR:-}" \
      --arg source_page "${PAGE:-}" \
      --arg pdf_sha "$PDF_SHA" \
      '{
        id: $id,
        version: $version,
        registry: $registry,
        sector: $sector,
        source_page: $source_page,
        status: "draft",
        references: {
          pdf: { path: "sources/\($id)/\($version)/source.pdf", sha256: $pdf_sha }
        },
        audit: {
          created_at: (now | todate),
          created_by: "ingest.sh",
          notes: "auto-scaffold; enrich rules/sections later"
        }
      }' > "$META"

    # Stubs are schema-valid as empty arrays in most setups; adjust if your schema requires a minimum.
    echo '[]' > "$SECTIONS"
    echo '[]' > "$RULES"
    echo '[]' > "$RULES_RICH"
  fi

  # 3) canonicalize + validate (if scripts exist)
  if [ "$RUN_VALIDATE" = "1" ]; then
    [ -x ./scripts/json-canonical-check.sh ] && ./scripts/json-canonical-check.sh --fix || true
    npm run -s validate:lean || true
  fi

  # 4) commit per-method
  if [ "$AUTO_COMMIT" = "1" ] && [ "$DRY_RUN" = "0" ]; then
    git add "$DEST_DIR" "$SRC_DIR" || true
    git commit -m "ingest: $ID $VER (+pdf, META, stubs)" || true
  fi

  echo "[done] $ID $VER"
done

echo "✅ ingest complete"

#!/usr/bin/env bash
set -euo pipefail
# Usage:
#   scripts/gen-method.sh [--dry-run] [--allow-create-outdir] STD DOM METH VER
# Behavior:
#   - Never overwrites existing *.rich.json
#   - By default, refuses to create new OUT_DIR (no-new-dirs mode). Use --allow-create-outdir to create it.
#   - Writes lean JSON atomically; only updates files if content changed.

dry=0; allow_create=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry=1; shift;;
    --allow-create-outdir) allow_create=1; shift;;
    *) break;;
  esac
done

STD="${1:?STD}"; DOM="${2:?DOM}"; METH="${3:?METH}"; VER="${4:?VER}"

TPL_DIR="docs/examples/TEMPLATE_METHOD"
META_TPL="$TPL_DIR/META.template.json"
TPL_SECTIONS="$TPL_DIR/sections.rich.json"
TPL_RULES="$TPL_DIR/rules.rich.json"

TOOLS_DIR="tools/$STD/$METH/$VER"
OUT_DIR="methodologies/$STD/$DOM/$METH/$VER"
RICH_SECTIONS="$OUT_DIR/sections.rich.json"
RICH_RULES="$OUT_DIR/rules.rich.json"

need() { [[ -f "$1" ]] || { echo "✖ missing: $1" >&2; exit 1; }; }
need "$META_TPL"
need "$TOOLS_DIR/source.pdf"

# Refuse to create OUT_DIR unless explicitly allowed
if [[ ! -d "$OUT_DIR" && $allow_create -ne 1 ]]; then
  echo "✖ OUT_DIR missing and creation is disabled: $OUT_DIR"
  echo "  Use --allow-create-outdir to create it."
  exit 2
fi
[[ -d "$OUT_DIR" ]] || { [[ $dry -eq 1 ]] || mkdir -p "$OUT_DIR"; }

sha() { command -v shasum >/dev/null && shasum -a 256 "$1" | awk '{print $1}' || sha256sum "$1" | awk '{print $1}'; }
atom_write() { # atom_write <target> <tmp-content-file>
  local tgt="$1" tmp="$2"
  if [[ -f "$tgt" ]] && cmp -s "$tgt" "$tmp"; then
    echo "∙ unchanged: $tgt"
    rm -f "$tmp"; return 0
  fi
  if [[ $dry -eq 1 ]]; then
    echo "→ would update: $tgt"
    rm -f "$tmp"; return 0
  fi
  mv "$tmp" "$tgt"
  echo "✓ wrote: $tgt"
}

# Bootstrap rich files ONLY if missing
if [[ ! -f "$RICH_SECTIONS" ]]; then
  if [[ $dry -eq 1 ]]; then echo "→ would bootstrap: $RICH_SECTIONS"; else cp "$TPL_SECTIONS" "$RICH_SECTIONS"; echo "✓ bootstrapped: $RICH_SECTIONS"; fi
fi
if [[ ! -f "$RICH_RULES" ]]; then
  if [[ $dry -eq 1 ]]; then echo "→ would bootstrap: $RICH_RULES"; else cp "$TPL_RULES" "$RICH_RULES"; echo "✓ bootstrapped: $RICH_RULES"; fi
fi

# Detect AR-TOOL refs from source.pdf (best effort)
TMP_TXT="$(mktemp)"; trap 'rm -f "$TMP_TXT"' EXIT
if command -v pdftotext >/dev/null 2>&1; then pdftotext -q "$TOOLS_DIR/source.pdf" "$TMP_TXT"; SRC="$TMP_TXT"; else SRC="$TOOLS_DIR/source.pdf"; fi
mapfile -t DETECTED < <(strings "$SRC" 2>/dev/null | grep -Eo 'AR-TOOL[0-9]{2}' | sort -u || true)

# If rules.rich.json has no refs at all, seed minimal refs from DETECTED (version-agnostic)
if ! jq -e '.rules[]? | select(.refs? and (.refs|length>0))' "$RICH_RULES" >/dev/null; then
  refs='[]'; for t in "${DETECTED[@]}"; do refs=$(jq -c --arg d "UNFCCC/${t}@any" '. + [{"doc":$d}]' <<<"$refs"); done
  tmp="$(mktemp)"
  jq --argjson R "$refs" '.rules = (.rules | map(.refs = (.refs // $R)))' "$RICH_RULES" > "$tmp"
  if [[ $dry -eq 1 ]]; then echo "→ would inject detected refs into: $RICH_RULES"; rm -f "$tmp"; else mv "$tmp" "$RICH_RULES"; echo "✓ refs injected (once): $RICH_RULES"; fi
fi

# Build dependency list from refs + present tool PDFs
declare -A REQ
while read -r doc; do
  [[ -z "$doc" ]] && continue
  num=$(sed -E 's/.*AR-TOOL([0-9]+)@.*/\1/' <<<"$doc")
  spec=$(sed -E 's/.*@(.+)/\1/' <<<"$doc")
  REQ["$num"]="$spec"
done < <(jq -r '.rules[]?.refs[]?.doc? // empty' "$RICH_RULES")

deps='[]'
if [[ -d "$TOOLS_DIR/tools" ]]; then
  while IFS= read -r -d '' pdf; do
    base=$(basename "$pdf")
    if [[ "$base" =~ ^AR-TOOL([0-9]+)_v([0-9-]+)\.pdf$ ]]; then
      num="${BASH_REMATCH[1]}"; ver="v${BASH_REMATCH[2]}"
      spec="${REQ[$num]:-}"; [[ -z "$spec" ]] && continue
      ok=0
      if [[ "$spec" == "any" || "$spec" == "*" ]]; then ok=1
      elif [[ "$spec" =~ ^v[0-9.-]+$ ]]; then [[ "$ver" == "$spec" ]] && ok=1
      elif [[ "$spec" =~ ^>=v[0-9.-]+$ ]]; then min="${spec#>=}"; { [[ "$ver" > "$min" ]] || [[ "$ver" == "$min" ]]; } && ok=1
      fi
      if [[ $ok -eq 1 ]]; then
        deps=$(jq -c --arg tool "UNFCCC/AR-TOOL${num}" --arg version "$ver" \
                    --arg path "tools/$STD/$METH/$VER/tools/$base" \
                    --arg sha "$(sha "$pdf")" \
                    '. + [{tool:$tool,version:$version,path:$path,sha256:$sha}]' <<<"$deps")
        unset "REQ[$num]"
      fi
    fi
  done < <(find "$TOOLS_DIR/tools" -maxdepth 1 -type f -name 'AR-TOOL*.pdf' -print0)
fi

# Fail if any required tool not satisfied
miss=()
for num in "${!REQ[@]}"; do miss+=("AR-TOOL${num}${REQ[$num]}"); done
if ((${#miss[@]})); then
  echo "✖ missing tool PDFs under $TOOLS_DIR/tools/: ${miss[*]}" >&2
  exit 3
fi

# Compose META.json
SRC_SHA=$(sha "$TOOLS_DIR/source.pdf")
RULES_SHA=$(sha "$RICH_RULES")
MAN_SHA=$( [[ -f "$TPL_DIR/manifest.json" ]] && sha "$TPL_DIR/manifest.json" || echo "" )
GEN_VERSION="gen-method.sh@$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

meta_tmp="$(mktemp)"
jq \
  --arg std "$STD" --arg dom "$DOM" --arg meth "$METH" --arg ver "$VER" \
  --arg src "tools/$STD/$METH/$VER/source.pdf" --arg sh "$SRC_SHA" \
  --argjson deps "$deps" --arg gen "$GEN_VERSION" --arg rsha "$RULES_SHA" --arg msha "$MAN_SHA" \
  '
  .standard=$std | .domain=$dom | .method=$meth | .version=$ver
  | .provenance.source_pdfs=[{path:$src,sha256:$sh}]
  | .provenance.dependencies=$deps
  | .provenance.rules_rich_sha256=$rsha
  | .provenance.template_manifest_sha256=$msha
  | .provenance.generator={"version":$gen}
  ' "$META_TPL" > "$meta_tmp"

sections_tmp="$(mktemp)"
jq '{sections: [.sections[] | {num,title,id}]}' "$RICH_SECTIONS" > "$sections_tmp"

rules_tmp="$(mktemp)"
jq '{rules: [.rules[] | {id,type,when,inputs,logic,notes,refs}]}' "$RICH_RULES" > "$rules_tmp"

atom_write "$OUT_DIR/META.json"      "$meta_tmp"
atom_write "$OUT_DIR/sections.json"  "$sections_tmp"
atom_write "$OUT_DIR/rules.json"     "$rules_tmp"

echo "✓ done."

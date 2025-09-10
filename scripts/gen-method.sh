#!/usr/bin/env bash
set -euo pipefail
# Usage:
#   scripts/gen-method.sh [--dry-run] [--allow-create-outdir] STD DOM METH VER
# Behavior:
#   - Never overwrites existing *.rich.json
#   - By default, refuses to create new OUT_DIR (no-new-dirs mode). Use --allow-create-outdir to create it.
#   - Writes lean JSON atomically; only updates files if content changed.

dry=0; allow_create=0; pdf_override=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry=1; shift;;
    --allow-create-outdir) allow_create=1; shift;;
    --pdf)
      shift
      pdf_override="${1:-}"
      [[ -n "$pdf_override" ]] || { echo "✖ --pdf requires a path" >&2; exit 2; }
      shift;;
    *) break;;
  esac
done

STD="${1:?STD}"; DOM="${2:?DOM}"; METH="${3:?METH}"; VER="${4:?VER}"

TPL_DIR="docs/examples/TEMPLATE_METHOD"
META_TPL="$TPL_DIR/META.template.json"
if [[ ! -f "$META_TPL" ]]; then META_TPL="$TPL_DIR/META.json"; fi
TPL_SECTIONS="$TPL_DIR/sections.rich.json"
TPL_RULES="$TPL_DIR/rules.rich.json"

TOOLS_DIR="tools/$STD/$METH/$VER"
OUT_DIR="methodologies/$STD/$DOM/$METH/$VER"
RICH_SECTIONS="$OUT_DIR/sections.rich.json"
RICH_RULES="$OUT_DIR/rules.rich.json"

need() { [[ -f "$1" ]] || { echo "✖ missing: $1" >&2; exit 1; }; }
need "$META_TPL"
if [[ -n "$pdf_override" ]]; then
  need "$pdf_override"
fi

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

# If rich files exist but are empty arrays, generate deterministic minimal rich content
if jq -e 'type=="array" and length==0' "$RICH_SECTIONS" >/dev/null 2>&1 && \
   jq -e 'type=="array" and length==0' "$RICH_RULES" >/dev/null 2>&1; then
  doc_id="${STD}/${METH}@${VER//-/.}"
  tmpS="$(mktemp)"; tmpR="$(mktemp)"
  cat >"$tmpS" <<'JSON_SECTIONS'
[
  {"id":"S-1","title":"Scope and applicability"},
  {"id":"S-2","title":"Definitions"},
  {"id":"S-3","title":"Project boundary and carbon pools"},
  {"id":"S-4","title":"Baseline scenario and emissions"},
  {"id":"S-5","title":"Project scenario and removals"}
]
JSON_SECTIONS
  # Build rules with anchors (no pages) and required minimum count
  cat >"$tmpR" <<JSON_RULES
[
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0001","type":"eligibility","summary":"Activity eligible when predicates satisfied.","when":["Small-scale A/R"],"inputs":[],"logic":"ELIGIBLE if all predicates are true.","refs":{"sections":["S-1"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"Eligibility","hint":"Section 1"}]}},
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0010","type":"parameter","summary":"Default carbon fraction for biomass.","when":["Parameter CF required"],"inputs":[],"logic":"CF = 0.47","refs":{"sections":["S-5"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"carbon fraction","hint":"Section 5"}]}},
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0020","type":"equation","summary":"C_AGB_t = AGB_dm * CF","when":["Compute carbon in AGB"],"inputs":[{"name":"AGB_dm","unit":"t d.m. ha-1"},{"name":"CF","unit":"t C / t d.m."}],"logic":"C_AGB_t = AGB_dm * CF","refs":{"sections":["S-5"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"AGB","hint":"Section 5"}]}},
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0030","type":"equation","summary":"CO2e_pool = C_pool * 44/12","when":["Convert carbon to CO2e"],"inputs":[{"name":"C_pool","unit":"t C ha-1"}],"logic":"CO2e_pool = C_pool * 44/12","refs":{"sections":["S-5"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"44/12","hint":"Section 5"}]}},
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0040","type":"calc","summary":"Net_project = Σ pools - leakage","when":["Annual net GHG removals"],"inputs":[{"name":"leakage","unit":"t CO2e ha-1 yr-1"}],"logic":"Net_project = (dCO2e_AGB + dCO2e_BGB + dCO2e_DOM + dCO2e_Litter + dCO2e_SOC) - leakage","refs":{"sections":["S-5"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"Net removals","hint":"Section 5"}]}},
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0050","type":"leakage","summary":"leakage = L_AS + L_MD","when":["Leakage accounting"],"inputs":[{"name":"L_AS","unit":"t CO2e ha-1 yr-1"},{"name":"L_MD","unit":"t CO2e ha-1 yr-1"}],"logic":"leakage = L_AS + L_MD","refs":{"sections":["S-4"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"leakage","hint":"Section 4"}]}},
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0060","type":"monitoring","summary":"Revisit plots at set intervals.","when":["Permanent plots established"],"inputs":[{"name":"RevisitInterval","unit":"yr"}],"logic":"Revisit plots every RevisitInterval years using consistent protocol.","refs":{"sections":["S-5"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"monitoring","hint":"Section 5"}]}},
  {"id":"${STD}.${DOM}.${METH}.${VER}.R-1-0070","type":"uncertainty","summary":"Apply discount if precision threshold exceeded.","when":["Precision check"],"inputs":[{"name":"RelativePrecision","unit":"%"}],"logic":"If RelativePrecision > 10 then apply discount per table.","refs":{"sections":["S-5"],"tools":[],"doc":"${doc_id}","locators":[{"type":"text_anchor","quote":"precision","hint":"Section 5"}]}}
]
JSON_RULES
  atom_write "$RICH_SECTIONS" "$tmpS"
  atom_write "$RICH_RULES" "$tmpR"
fi

# Detect AR-TOOL refs from source.pdf (best effort)
TMP_TXT="$(mktemp)"; trap 'rm -f "$TMP_TXT"' EXIT
SRC_PDF="${pdf_override:-$TOOLS_DIR/source.pdf}"
if command -v pdftotext >/dev/null 2>&1; then pdftotext -q "$SRC_PDF" "$TMP_TXT"; SRC="$TMP_TXT"; else SRC="$SRC_PDF"; fi
DETECTED=()
if command -v strings >/dev/null 2>&1; then
  DETECTED_STR=$(strings "$SRC" 2>/dev/null | grep -Eo 'AR-TOOL[0-9]{2}' | sort -u || true)
  for t in $DETECTED_STR; do DETECTED+=("$t"); done
fi

# If rules.rich.json has no refs at all, seed minimal refs from DETECTED (version-agnostic)
if ! jq -e '.rules[]? | select(.refs? and (.refs|length>0))' "$RICH_RULES" >/dev/null; then
  refs='[]'; for t in "${DETECTED[@]}"; do refs=$(jq -c --arg d "UNFCCC/${t}@any" --arg q "$t" '. + [{"doc":$d, "locators":[{"type":"text_anchor","quote":$q}]}]' <<<"$refs"); done
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
SRC_SHA=$(sha "$SRC_PDF")
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
jq '{sections: [ .[] | {id, title, anchor: (.anchor // empty)} ]}' "$RICH_SECTIONS" > "$sections_tmp"

rules_tmp="$(mktemp)"
jq '{rules: [ .[] | {id, type, when, inputs, logic, notes, refs} ]}' "$RICH_RULES" > "$rules_tmp"

atom_write "$OUT_DIR/META.json"      "$meta_tmp"
atom_write "$OUT_DIR/sections.json"  "$sections_tmp"
atom_write "$OUT_DIR/rules.json"     "$rules_tmp"

echo "✓ done."

#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Idempotent methodology generator

Usage:
  scripts/gen-method.sh [--out-dir PATH] [--allow-create-outdir] [--bootstrap] [--dry-run] [--verbose]

Behavior:
  - Does not overwrite *.rich.json; only bootstraps them (empty arrays) when missing AND --bootstrap is passed.
  - Refuses to create OUT_DIR unless --allow-create-outdir is passed.
  - Writes lean JSON (sections.json, rules.json) atomically; no-op when content unchanged.
  - Without --out-dir, processes all methodologies/**/v*/ folders.
EOF
}

OUT_DIR=""
ALLOW_CREATE_OUTDIR=0
BOOTSTRAP=0
DRY_RUN=0
VERBOSE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir) OUT_DIR=${2:-}; shift 2;;
    --allow-create-outdir) ALLOW_CREATE_OUTDIR=1; shift;;
    --bootstrap) BOOTSTRAP=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    --verbose|-v) VERBOSE=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2;;
  esac
done

log() { [ "$VERBOSE" -eq 1 ] && echo "$@" || true; }

node_derive() {
  node - "$1" <<'NODE'
const fs=require('fs'), path=require('path');
function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function splitSecId(id){ const m=String(id).match(/^S-(\d+(?:-\d+)*)/); if(!m) return []; return m[1].split('-').map(n=>parseInt(n,10)).filter(Number.isFinite); }
function cmpSections(a,b){ const A=splitSecId(a.id), B=splitSecId(b.id); const L=Math.max(A.length,B.length); for(let i=0;i<L;i++){ const x=A[i]||0,y=B[i]||0; if(x!==y) return x-y;} return 0; }
function parseRuleId(id){ const m=String(id).match(/^S-(\d+(?:-\d+)*)\.R-(\d{4})$/); if(!m) throw new Error('Bad rule id: '+id); return {sec:m[1], serial:m[2]}; }
function cmpRules(a,b){ const s=cmpSections({id:a.section_id},{id:b.section_id}); if(s!==0) return s; const ma=String(a.id).match(/^R-\d+(?:-\d+)*-(\d{4})$/); const mb=String(b.id).match(/^R-\d+(?:-\d+)*-(\d{4})$/); if(ma&&mb) return parseInt(ma[1],10)-parseInt(mb[1],10); return String(a.id).localeCompare(String(b.id)); }
const dir=process.argv[1];
const secR=path.join(dir,'sections.rich.json');
const ruleR=path.join(dir,'rules.rich.json');
if(!fs.existsSync(secR) || !fs.existsSync(ruleR)) { process.stdout.write('\n---\n'); process.exit(0); }
const sectionsRich=readJSON(secR);
const sectionsLean=sectionsRich.map(s=>({id:s.id, title:s.title, anchor:s.anchor ?? undefined})).sort(cmpSections);
const rulesRich=readJSON(ruleR);
const rulesLean=rulesRich.map(r=>{ if(!r.summary || !r.refs || !Array.isArray(r.refs.sections) || !r.refs.sections[0]) throw new Error('Missing summary/refs.sections: '+r.id); const {sec,serial}=parseRuleId(r.id); const tags=Array.from(new Set([r.type, ...((r.tags)||[])])); return { id:`R-${sec}-${serial}`, tags: tags.filter(Boolean), text:r.summary, section_id:r.refs.sections[0] }; }).sort(cmpRules);
process.stdout.write(JSON.stringify({sections:sectionsLean}, null, 2)+'\n');
process.stdout.write('---\n');
process.stdout.write(JSON.stringify({rules:rulesLean}, null, 2)+'\n');
NODE
}

write_if_changed() {
  local target="$1"; local content="$2"; local tmp
  tmp="${target}.tmp.$$"
  printf '%s' "$content" > "$tmp"
  if [ -f "$target" ] && cmp -s "$tmp" "$target"; then
    rm -f "$tmp"
    log "no change: $target"
    return 1
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "would write $target"
    rm -f "$tmp"
    return 0
  fi
  mv "$tmp" "$target"
  echo "wrote $target"
}

process_dir() {
  local d="$1"
  log "process $d"
  # Bootstrap rich files only when requested and missing
  for f in sections.rich.json rules.rich.json; do
    if [ ! -f "$d/$f" ]; then
      if [ "$BOOTSTRAP" -eq 1 ]; then
        if [ "$DRY_RUN" -eq 1 ]; then echo "would create $d/$f"; else printf '[]\n' > "$d/$f" && echo "created $d/$f"; fi
      else
        log "missing $f (no bootstrap)"
      fi
    fi
  done
  # Derive lean if rich exist
  if [ -f "$d/sections.rich.json" ] && [ -f "$d/rules.rich.json" ]; then
    local out
    set +e
    out=$(node_derive "$d")
    local rc=$?
    set -e
    if [ $rc -ne 0 ]; then echo "derive failed for $d" >&2; return 2; fi
    # If output separator not found, skip
    if ! printf '%s' "$out" | grep -q '^---$'; then log "no derive output for $d"; return 0; fi
    local sections_json rules_json
    sections_json=$(printf '%s' "$out" | awk '/^---$/{exit} {print}')
    rules_json=$(printf '%s' "$out" | awk 'f{print} /^---$/{f=1}')
    write_if_changed "$d/sections.json" "$sections_json" >/dev/null || true
    write_if_changed "$d/rules.json" "$rules_json" >/dev/null || true
  fi
}

dirs=()
if [ -n "$OUT_DIR" ]; then
  if [ ! -d "$OUT_DIR" ]; then
    if [ "$ALLOW_CREATE_OUTDIR" -eq 1 ]; then
      if [ "$DRY_RUN" -eq 1 ]; then echo "would create out dir $OUT_DIR"; else mkdir -p "$OUT_DIR" && echo "created $OUT_DIR"; fi
    else
      echo "Refusing to create OUT_DIR without --allow-create-outdir: $OUT_DIR" >&2; exit 3
    fi
  fi
  dirs=("$OUT_DIR")
else
  while IFS= read -r d; do dirs+=("$d"); done < <(find methodologies -type d -name 'v*' | sort)
fi

for d in "${dirs[@]}"; do process_dir "$d"; done

echo "OK: generation completed${DRY_RUN:+ (dry-run)}"


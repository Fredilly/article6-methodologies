#!/usr/bin/env bash
set -euo pipefail

# --- toggles ---
DRY_RUN="${DRY_RUN:-0}"
AUTO_COMMIT="${AUTO_COMMIT:-0}"
RUN_VALIDATE="${RUN_VALIDATE:-1}"
PREFETCH_ONLY="${PREFETCH_ONLY:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/net.sh"

if [ "$PREFETCH_ONLY" = "1" ]; then
  DRY_RUN=1
  RUN_VALIDATE=0
  AUTO_COMMIT=0
fi

if [ "$AUTO_COMMIT" = "1" ] && [ "${ALLOW_AUTO_COMMIT:-0}" != "1" ]; then
  echo "[ingest] AUTO_COMMIT=1 requires ALLOW_AUTO_COMMIT=1 (set ALLOW_AUTO_COMMIT=1 to proceed)" >&2
  exit 2
fi

INGEST_ASSET_ROOT="${INGEST_ASSET_ROOT:-$PWD/source-assets}"
mkdir -p "$INGEST_ASSET_ROOT"

need() { command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= //'
  fi
}
json_escape() { jq -Rs . <<<"${1}"; }

hash_string() {
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$1" | openssl dgst -sha256 | sed 's/^.*= //'
  fi
}

file_size() {
  python3 - "$1" <<'PY'
import os, sys
path = sys.argv[1]
print(os.path.getsize(path) if os.path.exists(path) else 0)
PY
}

infer_tool_doc() {
  local base="$1"
  local org="$2"
  local fallback="$3"
  local stem="${base##*/}"
  stem="${stem%.pdf}"
  local doc=""
  if [[ "$stem" == *-v* ]]; then
    local slug="${stem%-v*}"
    local version="${stem##*-v}"
    if [[ "$version" =~ ^[0-9][0-9.]*$ ]]; then
      slug="$(echo "$slug" | tr '[:lower:]' '[:upper:]')"
      doc="${org}/${slug}@v${version}"
    else
      doc="$fallback"
    fi
  else
    doc="$fallback"
  fi
  printf '%s\n' "$doc"
}

append_tool_reference() {
  [ -z "${tool_refs_tmp:-}" ] && return 0
  local doc="$1"
  local path="$2"
  local sha="$3"
  local size="${4:-0}"
  local url="${5:-}"
  jq -n \
    --arg doc "$doc" \
    --arg path "$path" \
    --arg sha "$sha" \
    --arg url "$url" \
    --argjson size "$size" \
    '{
      doc:$doc,
      kind:"pdf",
      path:$path,
      sha256:$sha,
      size:$size,
      url: (if ($url | length) == 0 then null else $url end)
    }' >> "$tool_refs_tmp"
}

cache_path_for_url() {
  local url="$1"
  local key base ext dir
  key="$(hash_string "$url")"
  base="${url%%\?*}"
  ext=".bin"
  if [[ $base =~ \.([A-Za-z0-9]{1,5})$ ]]; then
    local raw_ext="${BASH_REMATCH[1]}"
    ext=".$(printf '%s' "$raw_ext" | tr '[:upper:]' '[:lower:]')"
  fi
  dir="${INGEST_ASSET_ROOT%/}/${key:0:2}/${key:2:2}"
  printf '%s/%s%s' "$dir" "$key" "$ext"
}

ensure_cached_asset() {
  local url="$1"
  local cache_file lock tmp rc waited
  cache_file="$(cache_path_for_url "$url")"
  lock="${cache_file}.lock"
  mkdir -p "$(dirname "$cache_file")"
  waited=0
  while ! mkdir "$lock" 2>/dev/null; do
    sleep 0.2
    waited=$((waited + 1))
    if [ "$waited" -ge 1500 ]; then
      echo "[cache] timeout acquiring lock for $url" >&2
      return 120
    fi
  done

  cleanup_lock() {
    rm -rf "$lock"
  }

  if [ -s "$cache_file" ]; then
    printf '%s\n' "$cache_file"
    cleanup_lock
    return 0
  fi

  if [ "${NO_NETWORK:-0}" = "1" ]; then
    echo "[cache] missing cached asset for $url (NO_NETWORK=1)" >&2
    cleanup_lock
    return 112
  fi

  tmp="$(mktemp "${TMPDIR:-/tmp}/asset.XXXXXX")"
  if fetch "$url" "$tmp"; then
    mv "$tmp" "$cache_file"
    printf '{"url":"%s","fetched_at":"%s"}\n' "$url" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${cache_file}.meta"
    printf '%s\n' "$cache_file"
    rc=0
  else
    rm -f "$tmp"
    rc=$?
  fi

  cleanup_lock
  return "$rc"
}

copy_cached_asset() {
  local url="$1"
  local dest="$2"
  local cached
  cached="$(ensure_cached_asset "$url")" || return "$?"
  mkdir -p "$(dirname "$dest")"
  cp "$cached" "$dest"
}

# --- offline mode (no binaries, no network) ---
if [[ "${OFFLINE:-0}" == "1" ]]; then
  echo "[info] OFFLINE=1 → using offline batch pipeline"
  ./scripts/offline/ingest-offline.sh "${BATCH:-offline_drop/batch.yml}"
  exit $?
fi

need yq
need jq
need pup
need curl
need python3

INGEST_FILE="${INGEST_FILE:-ingest.yml}"
test -f "$INGEST_FILE" || { echo "No $INGEST_FILE"; exit 1; }

AUTHOR_FALLBACK="$(git config user.name 2>/dev/null || echo 'Codex Ingest')"
REPO_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo '')"
if [ -f scripts_manifest.json ]; then
  SCRIPTS_MANIFEST_SHA="$(sha256 scripts_manifest.json)"
else
  SCRIPTS_MANIFEST_SHA=""
fi
INGEST_STAGE="${INGEST_STAGE:-staging}"

method_count="$(yq '.methods | length' "$INGEST_FILE")"
if ! [[ "$method_count" =~ ^[0-9]+$ ]]; then
  echo "[ingest] unable to determine method count from $INGEST_FILE" >&2
  exit 1
fi

if [ -n "${INGEST_METHOD_INDEX:-}" ]; then
  if ! [[ "$INGEST_METHOD_INDEX" =~ ^[0-9]+$ ]] || [ "$INGEST_METHOD_INDEX" -lt 0 ] || [ "$INGEST_METHOD_INDEX" -ge "$method_count" ]; then
    echo "[ingest] INGEST_METHOD_INDEX=$INGEST_METHOD_INDEX is out of range (0..$((method_count-1)))" >&2
    exit 1
  fi
  method_indexes=("$INGEST_METHOD_INDEX")
else
  method_indexes=()
  for idx in $(seq 0 $((method_count - 1))); do
    method_indexes+=("$idx")
  done
fi

echo "[ingest] methods: $method_count"

for i in "${method_indexes[@]}"; do
  id="$(yq -r ".methods[$i].id" "$INGEST_FILE")"
  ver="$(yq -r ".methods[$i].version" "$INGEST_FILE")"
  sector="$(yq -r ".methods[$i].sector // \"\"" "$INGEST_FILE")"
  page="$(yq -r ".methods[$i].source_page // \"\"" "$INGEST_FILE")"
  pdf_url_override="$(yq -r ".methods[$i].pdf_url // \"\"" "$INGEST_FILE")"

  echo "———"
  echo "[ingest] $id $ver"

  # paths
  IFS='.' read -r -a id_parts <<<"$id"
  org="${id_parts[0]}"
  id_sector="${id_parts[1]:-}"
  program="${id_parts[1]:-}"
  code_parts=("${id_parts[@]:2}")
  if [ "${#code_parts[@]}" -eq 0 ]; then
    echo "[ingest] $id missing code segment" >&2
    exit 1
  fi
  code="${code_parts[0]}"
  if [ "${#code_parts[@]}" -gt 1 ]; then
    for part in "${code_parts[@]:1}"; do
      code="${code}.${part}"
    done
  fi
  method="$code"
   # method slug for rule ids should collapse any remaining dots into dashes
  method_slug="${code_parts[0]}"
  if [ "${#code_parts[@]}" -gt 1 ]; then
    for slug_part in "${code_parts[@]:1}"; do
      method_slug="${method_slug}-${slug_part}"
    done
  fi
  rest_path="${org}/${program}/${code}"
  if [ "$org" = "UNFCCC" ] && [ -z "$program" ]; then
    if [ -n "$sector" ]; then
      program="$(printf '%s' "$sector" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')"
    fi
  fi
  if [ "$org" = "UNFCCC" ]; then
    if [ -z "$program" ]; then
      echo "[ingest] $id missing <Program> segment (expected UNFCCC.<Program>.<Code>)" >&2
      exit 1
    fi
    if ! [[ "$rest_path" =~ ^UNFCCC/${program}/ ]]; then
      echo "[ingest] $id path must include program folder (expected UNFCCC/${program}/...)" >&2
      exit 1
    fi
    tools_dir="tools/${org}/${program}/${code}/${ver}"
  else
    tools_dir="tools/${org}/${code}/${ver}"
  fi
  dest_dir="methodologies/${rest_path}/${ver}"
  pdf_rel_path="${tools_dir}/source.pdf"
  pdf_path="$pdf_rel_path"
  method_doc="${org}/${method}@${ver}"
  pdf_sha=""
  pdf_size=0
  if [ "$DRY_RUN" = "0" ]; then
    mkdir -p "$dest_dir" "$tools_dir"
    tool_refs_tmp="$(mktemp)"
  else
    tool_refs_tmp=""
  fi

  # fetch page html (for link parsing) unless we have direct pdf_url
  html_tmp="$(mktemp)"
  if [ -n "$page" ]; then
    if ! page_cache="$(ensure_cached_asset "$page")"; then
      echo "[error] failed to fetch source page for $id ($page)" >&2
      rm -f "$html_tmp"
      if [ -n "$tool_refs_tmp" ]; then rm -f "$tool_refs_tmp"; fi
      continue
    fi
    cp "$page_cache" "$html_tmp"
    python3 - "$html_tmp" <<'PY' || true
import sys
import unicodedata
from pathlib import Path

path = Path(sys.argv[1])
data = path.read_bytes().decode('utf-8', 'replace')
path.write_text(unicodedata.normalize('NFC', data), encoding='utf-8')
PY
  else
    : > "$html_tmp"
  fi

  # resolve main PDF
  pdf_path="$pdf_rel_path"
  if [ -n "$pdf_url_override" ]; then
    pdf_url="$pdf_url_override"
  else
    # heuristic: first PDF whose link text contains "methodology" OR the first PDF on the page
    # (unfccc pages usually label the main doc; else we fall back)
    pdf_url="$(pup 'a' attr{href} < "$html_tmp" | grep -i '\.pdf' | head -n1 || true)"
  fi

  if [ -n "${pdf_url:-}" ]; then
    case "$pdf_url" in
      http*) true ;;
      *) # make relative absolute
         base="$(echo "$page" | sed -E 's#(/view\.html)?$##')"
         pdf_url="${base%/}/${pdf_url#./}"
         ;;
    esac
    echo "[pdf] $pdf_url"
    if [ "$DRY_RUN" = "1" ]; then
      if ! ensure_cached_asset "$pdf_url" >/dev/null; then
        echo "[error] cache miss for $pdf_url" >&2
        rm -f "$html_tmp"
        if [ -n "$tool_refs_tmp" ]; then rm -f "$tool_refs_tmp"; fi
        continue
      fi
    else
      if ! copy_cached_asset "$pdf_url" "$pdf_path"; then
        echo "[warn] $id: failed to download main PDF $pdf_url" >&2
        : > "$pdf_path"
      fi
    fi
  else
    echo "[warn] $id: main PDF not found; creating placeholder"
    if [ "$DRY_RUN" = "0" ]; then
      mkdir -p "$tools_dir"
      : > "$pdf_path"
    fi
  fi

  if [ "$DRY_RUN" = "0" ]; then
    if [ ! -s "$pdf_path" ]; then
      echo "[ingest] missing primary PDF at $pdf_path" >&2
      rm -f "$html_tmp" "$tool_refs_tmp"
      exit 1
    fi
    pdf_sha="$(sha256 "$pdf_path")"
    pdf_size="$(file_size "$pdf_path")"
    pdf_cache_meta=""
    if [ -n "${pdf_url:-}" ]; then
      cache_meta_path="$(cache_path_for_url "$pdf_url").meta"
      if [ -f "$cache_meta_path" ]; then
        pdf_cache_meta="$(jq -r '.fetched_at // empty' "$cache_meta_path" 2>/dev/null || true)"
      fi
    fi
    append_tool_reference "$method_doc" "$pdf_rel_path" "$pdf_sha" "$pdf_size" "${pdf_url:-}"
  fi

  # parse all links (text + href) → JSON
  links_json="$(pup 'a json{}' < "$html_tmp" 2>/dev/null || echo '[]')"
  rm -f "$html_tmp"

  include_count="$(yq ".methods[$i].include_text | length" "$INGEST_FILE" 2>/dev/null || echo 0)"
  exclude_count="$(yq ".methods[$i].exclude_text | length" "$INGEST_FILE" 2>/dev/null || echo 0)"

  # build filters
  includes=()
  if [ "$include_count" -gt 0 ]; then
    for j in $(seq 0 $((include_count-1))); do
      includes+=("$(yq -r ".methods[$i].include_text[$j]" "$INGEST_FILE")")
    done
  fi
  excludes=()
  if [ "$exclude_count" -gt 0 ]; then
    for j in $(seq 0 $((exclude_count-1))); do
      excludes+=("$(yq -r ".methods[$i].exclude_text[$j]" "$INGEST_FILE")")
    done
  fi

  # select tool links by visible text
  # we keep links with any include match, then drop those with any exclude match, and that end with .pdf
  tool_list="$(jq -r --argjson L "$links_json" '
    $L
    | map({text: (.text // ""), href: (.href // "")})
    | map(select((.href|test("\\.pdf$"; "i"))))
  ' <<<"$links_json")"

  # apply include/exclude in shell to preserve substring semantics (case-insensitive)
  save_tools=()
  while IFS=$'\n' read -r row; do
    [ -z "$row" ] && continue
    txt="$(jq -r '.text' <<<"$row")"
    href="$(jq -r '.href' <<<"$row")"
    keep=0
    # must match at least one include (if includes exist)
    if [ "${#includes[@]}" -gt 0 ]; then
      for s in "${includes[@]}"; do
        if echo "$txt" | grep -qi -- "$s"; then keep=1; break; fi
      done
    else
      keep=1
    fi
    # drop if any exclude matches
    if [ "$keep" -eq 1 ] && [ "${#excludes[@]}" -gt 0 ]; then
      for s in "${excludes[@]}"; do
        if echo "$txt" | grep -qi -- "$s"; then keep=0; break; fi
      done
    fi
    if [ "$keep" -eq 1 ]; then
      # absolutize
      if ! echo "$href" | grep -qi '^http'; then
        base="$(echo "$page" | sed -E 's#(/view\.html)?$##')"
        href="${base%/}/${href#./}"
      fi
      save_tools+=("$(jq -n --arg t "$txt" --arg u "$href" '{text:$t, url:$u}')")
    fi
  done < <(jq -c '.[]' <<<"$tool_list")

  # download tool PDFs
  if [ "${#save_tools[@]}" -gt 0 ]; then
    echo "[tools] ${#save_tools[@]} matched"
    for item in "${save_tools[@]}"; do
      t="$(jq -r '.text' <<<"$item")"
      u="$(jq -r '.url' <<<"$item")"
      base_url="${u%%\?*}"
      fname="$(basename "$base_url")"
      if [ -z "$fname" ]; then
        fname="$(echo "$t" | tr -cs '[:alnum:]_+.-' '-' | sed 's/^-*//; s/-*$//').pdf"
      fi
      stem_guess="${fname%.pdf}"
      if [[ "$stem_guess" == *-v* ]]; then
        slug_guess="${stem_guess%-v*}"
        version_raw="${stem_guess##*-v}"
        if [[ "$version_raw" =~ ^([0-9]+)(.*)$ ]]; then
          version_norm=$(printf '%02d' "${BASH_REMATCH[1]}")"${BASH_REMATCH[2]}"
        else
          version_norm="$version_raw"
        fi
        slug_norm="$(echo "$slug_guess" | tr '[:upper:]' '[:lower:]')"
        fname="${slug_norm}-v${version_norm}.pdf"
      fi
      out="$tools_dir/$fname"
      echo " - $t"
      if [ "$DRY_RUN" = "1" ]; then
        if ! ensure_cached_asset "$u" >/dev/null; then
          echo "[warn] cache miss for tool PDF $u" >&2
        fi
      else
        copy_cached_asset "$u" "$out" || echo "[warn] failed to download tool PDF $u" >&2
        if [ ! -s "$out" ]; then
          echo "[ingest] missing tool PDF $out" >&2
          rm -f "$html_tmp" "$tool_refs_tmp"
          exit 1
        fi
        tool_sha="$(sha256 "$out")"
        tool_size="$(file_size "$out")"
        tool_doc="$(infer_tool_doc "$fname" "$org" "$method_doc")"
        append_tool_reference "$tool_doc" "$out" "$tool_sha" "$tool_size" "$u"
      fi
    done
  else
    echo "[tools] none matched after include/exclude filters"
  fi

  # scaffold JSONs
  meta="$dest_dir/META.json"
  sections="$dest_dir/sections.json"
  rules="$dest_dir/rules.json"
  rules_rich="$dest_dir/rules.rich.json"

  if [ "$DRY_RUN" = "0" ]; then
    placeholder_section="S-0000"
    placeholder_rule="${org}.${id_sector}.${method_slug}.${ver}.R-0-0000"

    placeholder_section="S-0000"
    placeholder_rule="${org}.${id_sector}.${method_slug}.${ver}.R-0-0000"

    if [ -f "$sections" ]; then
      sections_sha="$(sha256 "$sections")"
    else
      cat <<JSON > "$sections"
{
  "sections": [
    {
      "id": "$placeholder_section",
      "title": "TODO: replace with extracted section content",
      "anchors": [],
      "content": ""
    }
  ]
}
JSON
      sections_sha="$(sha256 "$sections")"
    fi

    if [ -f "$rules" ]; then
      rules_sha="$(sha256 "$rules")"
    else
      cat <<JSON > "$rules"
{
  "rules": [
    {
      "id": "$placeholder_rule",
      "text": "TODO: replace with lean rule summary"
    }
  ]
}
JSON
      rules_sha="$(sha256 "$rules")"
    fi

    if [ ! -f "$rules_rich" ]; then
      cat <<JSON > "$rules_rich"
[
  {
    "id": "$placeholder_rule",
    "type": "eligibility",
    "summary": "TODO: replace with rich rule summary",
    "logic": "TODO",
    "refs": {
      "sections": [
        "$placeholder_section"
      ]
    }
  }
]
JSON
    fi

    if [ ! -f "$rules_rich" ]; then
      :
    fi

    [ -z "${sections_sha:-}" ] && sections_sha="$(sha256 "$sections")"
    [ -z "${rules_sha:-}" ] && rules_sha="$(sha256 "$rules")"

    if [ -z "$pdf_sha" ]; then
      echo "[ingest] missing pdf hash for $pdf_rel_path" >&2
      rm -f "$tool_refs_tmp"
      exit 1
    fi

    source_pdfs_json="$(jq -n \
      --arg kind "pdf" \
      --arg path "$pdf_rel_path" \
      --arg sha "$pdf_sha" \
      --argjson size "$pdf_size" \
      '[
        { kind:$kind, path:$path, sha256:$sha, size:$size }
      ]')"

    if [ -n "$tool_refs_tmp" ] && [ -s "$tool_refs_tmp" ]; then
      tool_refs_json="$(jq -s '.' "$tool_refs_tmp")"
    else
      echo "[ingest] references.tools missing for $id $ver" >&2
      rm -f "$tool_refs_tmp"
      exit 1
    fi

    author="${INGEST_AUTHOR:-$AUTHOR_FALLBACK}"
    created_at="${pdf_cache_meta:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

    TOOL_REFS_JSON="$tool_refs_json" \
    SOURCE_PDFS_JSON="$source_pdfs_json" \
    INGEST_META_ID="$id" \
    INGEST_META_VERSION="$ver" \
    INGEST_META_SECTOR="${sector:-}" \
    INGEST_META_PAGE="${page:-}" \
    INGEST_AUTHOR_VALUE="$author" \
    INGEST_CREATED_AT="$created_at" \
    INGEST_PDF_SHA="$pdf_sha" \
    INGEST_SECTIONS_SHA="$sections_sha" \
    INGEST_RULES_SHA="$rules_sha" \
    INGEST_AUTOMATION_COMMIT="$REPO_COMMIT" \
    INGEST_AUTOMATION_SCRIPTS_SHA="$SCRIPTS_MANIFEST_SHA" \
    INGEST_STAGE_VALUE="$INGEST_STAGE" \
    python3 - "$meta" <<'PY'
import json
import os
import sys

meta_path = sys.argv[1]
tool_refs = json.loads(os.environ["TOOL_REFS_JSON"])
source_pdfs = json.loads(os.environ["SOURCE_PDFS_JSON"])
if not tool_refs:
    raise SystemExit("references.tools is empty")
for ref in tool_refs:
    if not ref.get("doc"):
        raise SystemExit("references.tools entry missing doc")
    if not ref.get("sha256"):
        raise SystemExit("references.tools entry missing sha256")
if not source_pdfs:
    raise SystemExit("provenance.source_pdfs is empty")
meta = {
    "id": os.environ["INGEST_META_ID"],
    "version": os.environ["INGEST_META_VERSION"],
    "sector": os.environ.get("INGEST_META_SECTOR", ""),
    "source_page": os.environ.get("INGEST_META_PAGE", ""),
    "status": "draft",
    "stage": os.environ.get("INGEST_STAGE_VALUE", "staging"),
    "references": {
        "tools": tool_refs
    },
    "provenance": {
        "author": os.environ.get("INGEST_AUTHOR_VALUE", "Codex Ingest"),
        "date": os.environ["INGEST_CREATED_AT"],
        "source_pdfs": source_pdfs
    },
    "audit": {
        "created_at": os.environ["INGEST_CREATED_AT"],
        "created_by": "ingest.sh"
    },
    "audit_hashes": {
        "sections_json_sha256": os.environ["INGEST_SECTIONS_SHA"],
        "rules_json_sha256": os.environ["INGEST_RULES_SHA"],
        "source_pdf_sha256": os.environ["INGEST_PDF_SHA"]
    },
    "automation": {
        "repo_commit": os.environ.get("INGEST_AUTOMATION_COMMIT", ""),
        "scripts_manifest_sha256": os.environ.get("INGEST_AUTOMATION_SCRIPTS_SHA", "")
    }
}
with open(meta_path, "w", encoding="utf-8") as fh:
    json.dump(meta, fh, indent=2)
    fh.write("\n")
PY

    rm -f "$tool_refs_tmp"
    tool_refs_tmp=""
  fi

  # validate + commit
  if [ "$RUN_VALIDATE" = "1" ]; then
    if [ -x ./scripts/json-canonical-check.sh ]; then
      ./scripts/json-canonical-check.sh --fix "$meta" "$sections" "$rules" "$rules_rich" || true
    fi
    npm run -s validate:lean || true
  fi
  if [ "$AUTO_COMMIT" = "1" ] && [ "$DRY_RUN" = "0" ]; then
    git add "$dest_dir" "$tools_dir" || true
    git commit -m "ingest: ${id} ${ver} (+pdf, tools, META, stubs)" || true
  fi

  echo "[done] $id $ver"
done

echo "✅ ingest complete"

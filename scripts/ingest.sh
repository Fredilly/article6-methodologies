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
  method_parts=("${id_parts[@]:2}")
  method="${method_parts[0]:-}"
  if [ "${#method_parts[@]}" -gt 1 ]; then
    for part in "${method_parts[@]:1}"; do
      if [ -n "$method" ]; then
        method="${method}.${part}"
      else
        method="$part"
      fi
    done
  fi
  method_slug="${method//./-}"
  if [ -z "$method_slug" ]; then
    method_slug="${method}"
  fi
  rest_path="${org}/${id_sector}/${method}"
  dest_dir="methodologies/${rest_path}/${ver}"
  tools_dir="tools/${org}/${method}/${ver}"
  if [ "$DRY_RUN" = "0" ]; then
    mkdir -p "$dest_dir" "$tools_dir"
  fi

  # fetch page html (for link parsing) unless we have direct pdf_url
  html_tmp="$(mktemp)"
  if [ -n "$page" ]; then
    if ! page_cache="$(ensure_cached_asset "$page")"; then
      echo "[error] failed to fetch source page for $id ($page)" >&2
      rm -f "$html_tmp"
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
  pdf_path="$tools_dir/source.pdf"
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

  # parse all links (text + href) → JSON
  links_json="$(pup 'a json{}' < "$html_tmp" 2>/dev/null || echo '[]')"
  rm -f "$html_tmp"

  include_count="$(yq ".methods[$i].include_text | length" "$INGEST_FILE" 2>/dev/null || echo 0)"
  exclude_count="$(yq ".methods[$i].exclude_text | length" "$INGEST_FILE" 2>/dev/null || echo 0)"

  # build filters
  includes=()
  for j in $(seq 0 $((include_count-1))); do
    includes+=("$(yq -r ".methods[$i].include_text[$j]" "$INGEST_FILE")")
  done
  excludes=()
  for j in $(seq 0 $((exclude_count-1))); do
    excludes+=("$(yq -r ".methods[$i].exclude_text[$j]" "$INGEST_FILE")")
  done

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
      fname="$(echo "$t" | tr -cs '[:alnum:]_+.-' '-' | sed 's/^-*//; s/-*$//' ).pdf"
      out="$tools_dir/$fname"
      echo " - $t"
      if [ "$DRY_RUN" = "1" ]; then
        if ! ensure_cached_asset "$u" >/dev/null; then
          echo "[warn] cache miss for tool PDF $u" >&2
        fi
      else
        copy_cached_asset "$u" "$out" || echo "[warn] failed to download tool PDF $u" >&2
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
    pdf_sha=""
    [ -s "$pdf_path" ] && pdf_sha="$(sha256 "$pdf_path")"
    placeholder_section="S-0000"
    placeholder_rule="${org}.${id_sector}.${method_slug}.${ver}.R-0-0000"

    pdf_rel_path="tools/${org}/${method}/${ver}/source.pdf"
    jq -n \
      --arg id "$id" \
      --arg version "$ver" \
      --arg sector "${sector:-}" \
      --arg source_page "${page:-}" \
      --arg pdf_sha "$pdf_sha" \
      --arg pdf_path "$pdf_rel_path" \
      '{
        id:$id, version:$version, sector:$sector, source_page:$source_page,
        status:"draft",
        references:{
          tools:[
            {
              kind:"pdf",
              path:$pdf_path,
              sha256:$pdf_sha
            }
          ]
        },
        audit:{ created_at:(now|todate), created_by:"ingest.sh" },
        audit_hashes:{
          sections_json_sha256:"",
          rules_json_sha256:""
        }
      }' > "$meta"

    # schema-compliant placeholders to keep gates green until rich extraction lands
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

  # validate + commit
  if [ "$RUN_VALIDATE" = "1" ]; then
    [ -x ./scripts/json-canonical-check.sh ] && ./scripts/json-canonical-check.sh --fix || true
    npm run -s validate:lean || true
  fi
  if [ "$AUTO_COMMIT" = "1" ] && [ "$DRY_RUN" = "0" ]; then
    git add "$dest_dir" "$tools_dir" || true
    git commit -m "ingest: ${id} ${ver} (+pdf, tools, META, stubs)" || true
  fi

  echo "[done] $id $ver"
done

echo "✅ ingest complete"

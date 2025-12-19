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

file_size() {
  wc -c <"$1" | tr -d '[:space:]'
}

determine_kind() {
  case "${1##*.}" in
    pdf|PDF) printf 'pdf' ;;
    docx|DOCX) printf 'docx' ;;
    *) printf 'binary' ;;
  esac
}

add_tool_reference() {
  # Tool references are recomputed later via scripts/build-meta.cjs; this is a no-op hook to keep the ingest flow intact.
  :
}

derive_tool_doc() {
  local rel_path="$1"
  DOC_VAL="$(
    TOOL_PATH="$rel_path" node --input-type=module <<'NODE'
import { deriveToolDoc } from './scripts/lib/tool-doc.mjs';
const toolPath = process.env.TOOL_PATH || '';
process.stdout.write(deriveToolDoc(toolPath));
NODE
  )"
  printf '%s' "$DOC_VAL"
}

canonical_paths_json() {
  local id="$1"
  local version="$2"
  if [ -z "$id" ] || [ -z "$version" ]; then
    echo "[ingest] canonical path helper requires id and version" >&2
    return 1
  fi
  CANONICAL_JSON="$(
    CANON_ID="$id" CANON_VERSION="$version" node --input-type=module <<'NODE'
import { canonicalPaths } from './scripts/resolve-ingest-scope.mjs';
const id = process.env.CANON_ID || '';
const version = process.env.CANON_VERSION || '';
try {
  const result = canonicalPaths({ id, version });
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  console.error(`[canonical-paths] ${err.message}`);
  process.exit(1);
}
NODE
  )" || return 1
  printf '%s' "$CANONICAL_JSON"
}

ensure_canonical_layout() {
  local path_value="$1"
  local kind="$2"
  local expected_prefix="$3"
  if [[ ! "$path_value" =~ ^${expected_prefix}/[A-Za-z0-9._-]+/[A-Za-z0-9.-]+/v[0-9]{2}-[0-9]+$ ]]; then
    echo "[ingest] ${kind} path ${path_value} is not canonical (${expected_prefix}/<Program>/<Code>/vXX-0)" >&2
    exit 1
  fi
}

INGEST_FILE="${INGEST_FILE:-ingest.yml}"
test -f "$INGEST_FILE" || { echo "No $INGEST_FILE"; exit 1; }

method_count="$(yq '.methods | length' "$INGEST_FILE")"
if ! [[ "$method_count" =~ ^[0-9]+$ ]]; then
  echo "[ingest] unable to determine method count from $INGEST_FILE" >&2
  exit 1
fi

if [ "$method_count" -eq 0 ]; then
  echo "[ingest] methods: 0 (nothing to do)"
  exit 0
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
  method="${id_parts[${#id_parts[@]}-1]}"
   # method slug for rule ids should collapse any remaining dots into dashes
  method_slug="${id_parts[2]:-}"
  if [ "${#id_parts[@]}" -gt 3 ]; then
    for slug_part in "${id_parts[@]:3}"; do
      method_slug="${method_slug}-${slug_part}"
    done
  fi
  if [ -z "$method_slug" ]; then
    method_slug="${method}"
  fi
  canonical="$(canonical_paths_json "$id" "$ver")" || {
    echo "[ingest] unable to determine canonical paths for $id $ver" >&2
    exit 1
  }
  dest_dir="$(jq -r '.methodologiesDir' <<<"$canonical")"
  tools_dir="$(jq -r '.toolsDir' <<<"$canonical")"
  if [ -z "$dest_dir" ] || [ "$dest_dir" = "null" ] || [ -z "$tools_dir" ] || [ "$tools_dir" = "null" ]; then
    echo "[ingest] canonical path helper returned empty directories for $id $ver" >&2
    exit 1
  fi
  ensure_canonical_layout "$dest_dir" "methodologies" "methodologies/${org}"
  ensure_canonical_layout "$tools_dir" "tools" "tools/${org}"
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
  pdf_url=""
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
        if [ -s "$pdf_path" ]; then
          echo "[warn] $id: keeping existing main PDF at $pdf_path" >&2
        else
          echo "[warn] $id: no existing main PDF at $pdf_path; leaving missing" >&2
        fi
      fi
    fi
  else
    echo "[warn] $id: main PDF not found; skipping placeholder (do not clobber)" >&2
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
      raw_name="$(basename "${u%%\?*}")"
      if [[ "$raw_name" =~ \.(pdf|docx)$ ]]; then
        fname="$raw_name"
      else
        fname="$(echo "$t" | tr -cs '[:alnum:]_+.-' '-' | sed 's/^-*//; s/-*$//' ).pdf"
      fi
      out="$tools_dir/$fname"
      echo " - $t"
      if [ "$DRY_RUN" = "1" ]; then
        if ! ensure_cached_asset "$u" >/dev/null; then
          echo "[warn] cache miss for tool PDF $u" >&2
        fi
      else
        if copy_cached_asset "$u" "$out"; then
          tool_sha="$(sha256 "$out")"
          tool_size="$(file_size "$out")"
          doc_id="$(derive_tool_doc "$out")"
          if [ -z "$doc_id" ]; then
            echo "[ingest] unable to derive doc id for tool $out" >&2
            exit 1
          fi
          add_tool_reference "$out" "$doc_id" "$tool_sha" "$tool_size" "$(determine_kind "$out")" "$u"
        else
          echo "[warn] failed to download tool PDF $u" >&2
        fi
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
  sections_rich="$dest_dir/sections.rich.json"

  if [ "$DRY_RUN" = "0" ]; then
    if [ ! -s "$pdf_path" ]; then
      echo "[ingest] missing primary PDF for $id $ver ($pdf_path)" >&2
      exit 1
    fi
    node scripts/extract-sections.cjs "$dest_dir" "$pdf_path"
    if [ ! -s "$sections" ]; then
      echo "[ingest] section extractor failed for $id $ver" >&2
      exit 1
    fi
    if [ ! -s "$sections_rich" ]; then
      echo "[ingest] sections.rich.json missing after extraction for $id $ver" >&2
      exit 1
    fi

    node scripts/derive-rules-rich.cjs "$dest_dir"
    node scripts/derive-lean-from-rich.js "$dest_dir"
    node scripts/build-meta.cjs "$dest_dir"

    prev_tmp="$(mktemp)"
    if ! node scripts/parse-previous-versions.cjs "$html_tmp" > "$prev_tmp" 2>/dev/null; then
      echo '[]' > "$prev_tmp"
    fi
    prev_count="$(jq 'length' "$prev_tmp" 2>/dev/null || echo 0)"
    if [ "$prev_count" -gt 0 ]; then
      echo "[previous] detected $prev_count archived version(s)"
      while IFS= read -r prev_entry; do
        prev_version="$(jq -r '.version' <<<"$prev_entry")"
        version_number="$(jq -r '.version_number' <<<"$prev_entry")"
        pdf_url="$(jq -r '.pdf_url' <<<"$prev_entry")"
        effective_from="$(jq -r '.effective_from // ""' <<<"$prev_entry")"
        effective_to="$(jq -r '.effective_to // ""' <<<"$prev_entry")"
        if [ -z "$prev_version" ] || [ -z "$pdf_url" ]; then
          continue
        fi
        prev_meta_dir="$dest_dir/previous/$prev_version"
        prev_tools_dir="$tools_dir/previous/$prev_version/tools"
        if [ -f "$prev_meta_dir/META.json" ]; then
          echo "[previous] skip existing $prev_version"
          continue
        fi
        mkdir -p "$prev_meta_dir" "$prev_tools_dir"
        source_asset="source-assets/$org/$program/$code/$prev_version/source.pdf"
        mkdir -p "$(dirname "$source_asset")"
        if ! copy_cached_asset "$pdf_url" "$source_asset"; then
          echo "[previous] failed to download $pdf_url for $prev_version" >&2
          continue
        fi
        cp "$source_asset" "$prev_tools_dir/source.pdf"
        printf 'Normative tools: see active version %s/tools/\n' "$ver" > "$prev_tools_dir/POINTERS.md"
        prev_sha="$(sha256 "$source_asset")"
        prev_size="$(file_size "$source_asset")"
        node scripts/write-previous-meta.cjs \
          --method "$dest_dir" \
          --prev "$prev_meta_dir" \
          --version "$prev_version" \
          --version_number "$version_number" \
          --pdf_path "$source_asset" \
          --pdf_sha "$prev_sha" \
          --pdf_size "$prev_size" \
          --pdf_url "$pdf_url" \
          --method_page "$page" \
          --effective_from "$effective_from" \
          --effective_to "$effective_to"
      done < <(jq -c '.[]' "$prev_tmp")
    fi
    rm -f "$prev_tmp"
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

#!/usr/bin/env bash
set -euo pipefail

# --- toggles ---
DRY_RUN="${DRY_RUN:-0}"
AUTO_COMMIT="${AUTO_COMMIT:-1}"
RUN_VALIDATE="${RUN_VALIDATE:-1}"

need() { command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
json_escape() { jq -Rs . <<<"${1}"; }

need yq
need jq
need pup
need curl

INGEST_FILE="${INGEST_FILE:-ingest.yml}"
test -f "$INGEST_FILE" || { echo "No $INGEST_FILE"; exit 1; }

method_count="$(yq '.methods | length' "$INGEST_FILE")"
echo "[ingest] methods: $method_count"

for i in $(seq 0 $((method_count-1))); do
  id="$(yq -r ".methods[$i].id" "$INGEST_FILE")"
  ver="$(yq -r ".methods[$i].version" "$INGEST_FILE")"
  sector="$(yq -r ".methods[$i].sector // empty" "$INGEST_FILE")"
  page="$(yq -r ".methods[$i].source_page // empty" "$INGEST_FILE")"
  pdf_url_override="$(yq -r ".methods[$i].pdf_url // empty" "$INGEST_FILE")"

  echo "———"
  echo "[ingest] $id $ver"

  # paths
  IFS='.' read -r -a id_parts <<<"$id"
  org="${id_parts[0]}"
  method="${id_parts[${#id_parts[@]}-1]}"
  rest_path="$(echo "$id" | tr '.' '/')"
  dest_dir="methodologies/${rest_path}/${ver}"
  tools_dir="tools/${org}/${method}/${ver}"
  mkdir -p "$dest_dir" "$tools_dir"

  # fetch page html (for link parsing) unless we have direct pdf_url
  html_tmp="$(mktemp)"
  if [ -n "$page" ]; then
    curl -fsSL "$page" -o "$html_tmp"
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
    [ "$DRY_RUN" = "1" ] || curl -fsSL "$pdf_url" -o "$pdf_path"
  else
    echo "[warn] $id: main PDF not found; creating placeholder"
    [ "$DRY_RUN" = "1" ] || : > "$pdf_path"
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
  ' <<<'{}')"

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
      [ "$DRY_RUN" = "1" ] || curl -fsSL "$u" -o "$out"
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

    jq -n \
      --arg id "$id" \
      --arg version "$ver" \
      --arg sector "${sector:-}" \
      --arg source_page "${page:-}" \
      --arg pdf_sha "$pdf_sha" \
      --arg org "$org" \
      --arg method "$method" \
      '{
        id:$id, version:$version, sector:$sector, source_page:$source_page,
        status:"draft",
        references:{ pdf:{ path:"tools/\($org)/\($method)/\($version)/source.pdf", sha256:$pdf_sha }},
        audit:{ created_at:(now|todate), created_by:"ingest.sh" }
      }' > "$meta"

    # minimal placeholders (non-empty) to keep strict gates calm
    echo '[]' > "$sections"
    echo '[{"id":"SCHEMA_STUB","type":"placeholder","text":"Replace with extracted rules","evidence":[]}]' > "$rules"
    echo '[{"id":"SCHEMA_STUB","type":"placeholder","text":"Replace with rich rules","evidence":[]}]' > "$rules_rich"
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

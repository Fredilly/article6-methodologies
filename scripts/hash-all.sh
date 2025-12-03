#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= //'
  fi
}

tool_digest() {
  file="$1"
  if head -n1 "$file" 2>/dev/null | grep -q 'version https://git-lfs.github.com/spec/v1'; then
    oid=$(grep -E '^oid sha256:' "$file" | sed 's/^oid sha256://')
    sz=$(grep -E '^size ' "$file" | awk '{print $2}')
    if [ -n "$oid" ]; then
      if [ -z "$sz" ]; then
        sz=$(wc -c < "$file")
      fi
      printf '%s %s' "$oid" "$sz"
      return 0
    fi
  fi
  printf '%s %s' "$(hash_file "$file")" "$(wc -c < "$file")"
}

derive_doc() {
  file="$1"
  org="$2"
  method_slug="$3"
  version_slug="$4"
  printf '%s\n' "$file" | ORG="$org" METHOD_SLUG="$method_slug" VERSION_SLUG="$version_slug" awk -F'/' '
    BEGIN {
      org = ENVIRON["ORG"];
      method = ENVIRON["METHOD_SLUG"];
      ver = ENVIRON["VERSION_SLUG"];
    }
    {
      fileName = $NF;
      upper = toupper(fileName);
      if (match(upper, /^AR-[A-Z0-9]+_V[0-9]+(-[0-9]+)*\.(PDF|DOCX)$/)) {
        split(upper, a, "_V");
        tool = a[1];
        tver = a[2];
        sub(/\.(PDF|DOCX)$/, "", tver);
        gsub(/-/, ".", tver);
        printf "%s/%s@v%s", org, tool, tver;
      } else if (upper ~ /(SOURCE\.(PDF|DOCX)|METH_BOOKLET\.PDF)$/) {
        printf "%s/%s@%s", org, method, ver;
      } else {
        safe = fileName;
        sub(/\.[^.]+$/, "", safe);
        gsub(/[^A-Za-z0-9]/, "-", safe);
        gsub(/^-+/, "", safe);
        gsub(/-+$/, "", safe);
        if (safe == "") safe = "asset";
        printf "%s/%s@%s#%s", org, method, ver, safe;
      }
    }'
}

scripts_manifest_sha=$(./scripts/hash-scripts.sh)

find methodologies -name META.json | sort | while read -r meta_file; do
  dir=$(dirname "$meta_file")
case "$dir" in
    *"/previous/"*)
      source_pdf=$(jq -r '
        ([
          (.provenance.source_pdfs[]?.path // ""),
          ((.references.tools // [])[]? | (.path // ""))
        ]
        | map(select((. // "") | endswith("/source.pdf")))
        | map(select(. != ""))
        | .[0]) // ""' "$meta_file")
      if [ -z "$source_pdf" ]; then
        id=$(jq -r '.id // ""' "$meta_file")
        ver=$(jq -r '.version // ""' "$meta_file")
        if [ -n "$id" ] && [ -n "$ver" ]; then
          id_path=$(printf '%s\n' "$id" | tr '.' '/')
          source_pdf="source-assets/${id_path}/${ver}/source.pdf"
        fi
      fi
      if [ -z "$source_pdf" ] || [ ! -f "$source_pdf" ]; then
        echo "[hash-all] missing previous source PDF reference for $meta_file (expected: ${source_pdf:-unknown})" >&2
        exit 1
      fi
      source_hash=$(hash_file "$source_pdf")
      tmp="$meta_file.tmp"
      jq --arg source "$source_hash" \
        '.audit_hashes = (.audit_hashes // {}) |
         .audit_hashes.source_pdf_sha256 = $source |
         .references = (.references // {}) |
         .references.tools = (.references.tools // [])' \
        "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
      continue
      ;;
esac
  sections_hash=$(hash_file "$dir/sections.json")
  rules_hash=$(hash_file "$dir/rules.json")
  rel=${dir#methodologies/}
  org=${rel%%/*}
  rest=${rel#*/}
  version=${rest##*/}
  version_slug=$(printf '%s\n' "$version" | tr '-' '.')
  method_path=${rest%/*}
  sector=${method_path%%/*}
  if [ "$sector" = "$method_path" ]; then
    sector=""
    id_path="$method_path"
  else
    id_path=${method_path#*/}
  fi
  if [ -z "$id_path" ]; then
    id_path="$sector"
    sector=""
  fi
  method_slug=$(printf '%s\n' "$id_path" | tr '/' '.')
  if [ -z "$method_slug" ]; then
    method_slug=$(printf '%s\n' "$sector" | tr '/' '.')
  fi
  tool_dirs=""
  base_dir="tools/$org"
  if [ -n "$id_path" ]; then
    base_dir="$base_dir/$id_path"
  fi
  base_dir="$base_dir/$version"
  if [ -d "$base_dir" ]; then
    tool_dirs="$base_dir"
  fi
  if [ -n "$sector" ]; then
    with_sector="tools/$org/$sector"
    if [ -n "$id_path" ]; then
      with_sector="$with_sector/$id_path"
    fi
    with_sector="$with_sector/$version"
    if [ -d "$with_sector" ]; then
      if [ -n "$tool_dirs" ]; then
        tool_dirs="$tool_dirs
$with_sector"
      else
        tool_dirs="$with_sector"
      fi
    fi
  fi
  tools_json='[]'
  source_hash=""
  if [ -n "$tool_dirs" ]; then
    tools_json=$(printf '%s\n' "$tool_dirs" | while read -r dir; do
      [ -n "$dir" ] && find "$dir" -type f ! -path '*/previous/*'
    done | sort -u | while read -r f; do
      set -- $(tool_digest "$f")
      sha="$1"
      size="$2"
      kind="${f##*.}"
      doc=$(derive_doc "$f" "$org" "$method_slug" "$version_slug")
      printf '{"doc":"%s","path":"%s","sha256":"%s","size":%s,"kind":"%s"}\n' "$doc" "$f" "$sha" "$size" "$kind"
    done | jq -s '.')
  fi
  if [ -z "$source_hash" ] && [ "$tools_json" != '[]' ]; then
    method_doc_exact="$org/$method_slug@$version_slug"
    method_doc_prefix="$org/$method_slug@"
    source_hash=$(printf '%s' "$tools_json" | jq -r --arg exact "$method_doc_exact" '
      (map(select((.doc // "") == $exact)) | .[0].sha256) // empty')
    if [ -z "$source_hash" ]; then
      source_hash=$(printf '%s' "$tools_json" | jq -r --arg prefix "$method_doc_prefix" '
      (map(select((.doc // "") | startswith($prefix))) | .[0].sha256) // empty')
    fi
    if [ -z "$source_hash" ]; then
      source_hash=$(printf '%s' "$tools_json" | jq -r '
        (map(select((.path // "") | endswith("/source.pdf"))) | .[0].sha256) // empty')
    fi
  fi
  if [ -z "$source_hash" ]; then
    prov_path=$(jq -r '.provenance.source_pdfs[0].path? // ""' "$meta_file")
    if [ -n "$prov_path" ] && [ -f "$prov_path" ]; then
      source_hash=$(hash_file "$prov_path")
    fi
  fi
  if [ -z "$source_hash" ]; then
    echo "[hash-all] unable to determine source_pdf hash for $meta_file" >&2
    exit 1
  fi
  tmp="$meta_file.tmp"
  jq \
    --arg sections "$sections_hash" \
    --arg rules "$rules_hash" \
    --arg source "$source_hash" \
    --argjson tools "$tools_json" \
    --arg manifest "$scripts_manifest_sha" \
    '.audit_hashes.sections_json_sha256 = $sections |
     .audit_hashes.rules_json_sha256 = $rules |
     .audit_hashes.source_pdf_sha256 = $source |
     .references.tools = ((.references.tools // []) |
       reduce $tools[] as $t (
         .;
         if (map(.path == $t.path) | any) then
           map(if .path == $t.path then
                 .sha256 = $t.sha256
               | .size = $t.size
               | .doc = (if (.doc // "") == "" then $t.doc else .doc end)
               | .url = (.url // null)
               | .kind = (.kind // $t.kind)
               else . end)
               else
                 . + [$t]
               end
             ) | sort_by(.path)) |
     .automation = {scripts_manifest_sha256: $manifest}' \
    "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
done
echo "OK: refreshed META.audit_hashes, references.tools, and automation pins"

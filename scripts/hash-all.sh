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

repo_commit=$(git rev-parse HEAD)
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
  IFS=/ read -r org sector id version <<EOF2
$rel
EOF2
  base_dir="tools/$org/$id/$version"
  sector_dir="tools/$org/$sector/$id/$version"
  tool_dirs=""
  if [ -d "$base_dir" ]; then
    tool_dirs="$base_dir"
  fi
  if [ "$sector_dir" != "$base_dir" ] && [ -d "$sector_dir" ]; then
    if [ -n "$tool_dirs" ]; then
      tool_dirs="$tool_dirs\n$sector_dir"
    else
      tool_dirs="$sector_dir"
    fi
  fi
  tools_json='[]'
  source_hash=""
  if [ -n "$tool_dirs" ]; then
    tools_json=$(printf '%s\n' "$tool_dirs" | while read -r dir; do
      [ -n "$dir" ] && find "$dir" -type f
    done | sort -u | while read -r f; do
      set -- $(tool_digest "$f")
      sha="$1"
      size="$2"
      kind="${f##*.}"
      doc=$(printf "%s\n" "$f" | awk -F'/' '{org=$2; file=$NF; method=$(NF-2); ver=$(NF-1); if (match(file, /^AR-[A-Z0-9]+_v[0-9]+(-[0-9]+)*\.(pdf|docx)$/)) {split(file,a,"_v"); tool=a[1]; ver=a[2]; sub(/\.(pdf|docx)$/,"",ver); gsub(/-/,".",ver); printf "%s/%s@v%s", org, tool, ver} else if (file ~ /(source\.(pdf|docx)|meth_booklet\.pdf)$/) {gsub(/-/,".",ver); printf "%s/%s@%s", org, method, ver}}')
      printf '{"doc":"%s","path":"%s","sha256":"%s","size":%s,"kind":"%s"}\n' "$doc" "$f" "$sha" "$size" "$kind"
    done | jq -s '.')
  fi
  if [ -z "$source_hash" ] && [ "$tools_json" != '[]' ]; then
    method_doc_prefix="$org/$id@"
    source_hash=$(printf '%s' "$tools_json" | jq -r --arg prefix "$method_doc_prefix" '
      (map(select((.doc // "") | startswith($prefix))) | .[0].sha256) // empty')
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
    --arg commit "$repo_commit" \
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
     .automation = (.automation // {}) |
     .automation.scripts_manifest_sha256 = $manifest |
     .automation.repo_commit = $commit' \
    "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
done
echo "OK: refreshed META.audit_hashes, references.tools, and automation pins"

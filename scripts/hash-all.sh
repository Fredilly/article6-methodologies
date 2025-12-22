#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

INGEST_SCOPE_YML=""
SCOPE_FILE=""
while [ "${1:-}" != "" ]; do
  case "$1" in
    --ingest-yml)
      INGEST_SCOPE_YML="${2:-}"
      shift 2
      ;;
    --scope-file)
      SCOPE_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Usage: scripts/hash-all.sh [--ingest-yml <ingest.yml> | --scope-file <path>]" >&2
      exit 2
      ;;
  esac
done
if [ -n "$INGEST_SCOPE_YML" ] && [ -n "$SCOPE_FILE" ]; then
  echo "[hash-all] provide only one of: --ingest-yml, --scope-file" >&2
  exit 2
fi

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
      lower = tolower(fileName);
      if (match(upper, /^AR-[A-Z0-9]+_V[0-9]+(-[0-9]+)*\.(PDF|DOCX)$/)) {
        split(upper, a, "_V");
        tool = a[1];
        tver = a[2];
        sub(/\.(PDF|DOCX)$/, "", tver);
        gsub(/-/, ".", tver);
        printf "%s/%s@v%s", org, tool, tver;
      } else if (lower ~ /^am-tool-[0-9]+-v[0-9a-z.\-]+\.(pdf|docx)$/) {
        tmp = lower;
        sub(/^am-tool-/, "", tmp);
        sub(/\.(pdf|docx)$/, "", tmp);
        idx = index(tmp, "-v");
        toolNumRaw = tmp;
        verRaw = "";
        if (idx > 0) {
          toolNumRaw = substr(tmp, 1, idx - 1);
          verRaw = substr(tmp, idx + 2);
        }
        toolNum = toolNumRaw + 0;
        if (verRaw == "") {
          verNorm = sprintf("v%02d", toolNum);
        } else if (match(verRaw, /^[0-9]+/)) {
          majorStr = substr(verRaw, RSTART, RLENGTH);
          rest = substr(verRaw, RLENGTH + 1);
          majorNum = majorStr + 0;
          verNorm = sprintf("v%02d%s", majorNum, rest);
        } else {
          verNorm = "v" verRaw;
        }
        printf "%s/AM-TOOL%02d@%s", org, toolNum, verNorm;
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

meta_files=""
if [ -n "$INGEST_SCOPE_YML" ]; then
  if [ ! -f "$INGEST_SCOPE_YML" ]; then
    echo "[hash-all] ingest scope file not found: $INGEST_SCOPE_YML" >&2
    exit 2
  fi
  meta_files="$(node ./scripts/ingest-scope-paths.mjs --ingest-yml "$INGEST_SCOPE_YML" --kind meta-files)"
elif [ -n "$SCOPE_FILE" ]; then
  if [ ! -f "$SCOPE_FILE" ]; then
    echo "[hash-all] scope file not found: $SCOPE_FILE" >&2
    exit 2
  fi
  meta_files="$(node ./scripts/ingest-scope-paths.mjs --scope-file "$SCOPE_FILE" --kind meta-files)"
fi

if [ -n "$INGEST_SCOPE_YML" ] || [ -n "$SCOPE_FILE" ]; then
  missing=0
  while IFS= read -r meta_file; do
    [ -z "$meta_file" ] && continue
    if [ ! -f "$meta_file" ]; then
      echo "[hash-all] missing META file for scoped hash: $meta_file" >&2
      missing=1
    fi
  done <<EOF
$meta_files
EOF
  if [ "$missing" -ne 0 ]; then
    exit 1
  fi

  # Also refresh any previous-version META files nested under scoped active versions:
  # methodologies/<Org>/<Sector>/<Code>/<Active>/previous/<Prev>/META.json
  expanded="$(mktemp "${TMPDIR:-/tmp}/article6.meta-files.expanded.XXXXXX")"
  printf '%s\n' "$meta_files" | sed '/^$/d' > "$expanded"
  while IFS= read -r meta_file; do
    [ -z "$meta_file" ] && continue
    dir=$(dirname "$meta_file")
    prev_dir="$dir/previous"
    if [ -d "$prev_dir" ]; then
      find "$prev_dir" -type f -name META.json -print | LC_ALL=C sort >> "$expanded"
    fi
  done < "$expanded"
  meta_files="$(LC_ALL=C sort -u "$expanded")"
  rm -f "$expanded"
else
  meta_files="$(find methodologies -name META.json | sort)"
fi

while IFS= read -r meta_file; do
  [ -z "$meta_file" ] && continue
  dir=$(dirname "$meta_file")
case "$dir" in
    *"/previous/"*)
      # Previous versions are stored under the active version directory:
      # methodologies/<Org>/<Sector>/<Code>/<Active>/previous/<Prev>
      rel_dir="${dir#methodologies/}"
      org="$(printf '%s' "$rel_dir" | awk -F/ '{print $1}')"
      sector="$(printf '%s' "$rel_dir" | awk -F/ '{print $2}')"
      code="$(printf '%s' "$rel_dir" | awk -F/ '{print $3}')"
      active_version="$(printf '%s' "$rel_dir" | awk -F/ '{print $4}')"
      prev_version="$(printf '%s' "$rel_dir" | awk -F/ '{print $6}')"

      if [ -z "$org" ] || [ -z "$sector" ] || [ -z "$code" ] || [ -z "$active_version" ] || [ -z "$prev_version" ]; then
        echo "[hash-all] unexpected previous dir layout: $dir" >&2
        exit 2
      fi

      prev_tools_dir="tools/${org}/${sector}/${code}/${active_version}/previous/${prev_version}/tools"
      source_pdf=$(jq -r '
        ([
          (.provenance.source_pdfs[]?.path // ""),
          ((.references.tools // [])[]? | (.path // ""))
        ]
        | map(select((. // "") | endswith("/source.pdf")))
        | map(select(. != ""))
        | .[0]) // ""' "$meta_file")
      if [ -z "$source_pdf" ] || [ ! -f "$source_pdf" ]; then
        prev_source_pdf="${prev_tools_dir}/source.pdf"
        if [ -f "$prev_source_pdf" ]; then
          source_pdf="$prev_source_pdf"
        fi
      fi
      if [ -z "$source_pdf" ] || [ ! -f "$source_pdf" ]; then
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

      # Legacy previous dirs may only contain META.json; if so, only pin source_pdf_sha256 + scripts manifest.
      if [ ! -f "$dir/sections.json" ] || [ ! -f "$dir/rules.json" ]; then
        tmp="$meta_file.tmp"
        jq \
          --arg source "$source_hash" \
          --arg manifest "$scripts_manifest_sha" \
          '.audit_hashes = (.audit_hashes // {}) |
           .audit_hashes.source_pdf_sha256 = $source |
           .references = (.references // {}) |
           .references.tools = (.references.tools // []) |
           .automation = (.automation // {}) |
           .automation.scripts_manifest_sha256 = $manifest' \
          "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
        continue
      fi

      sections_hash=$(hash_file "$dir/sections.json")
      rules_hash=$(hash_file "$dir/rules.json")

      # Gather PDF tools under the previous tools dir (stable order), then update references.tools.
      tools_json=$(find "$prev_tools_dir" -type f -name '*.pdf' -print | LC_ALL=C sort | while IFS= read -r f; do
        [ -f "$f" ] || continue
        set -- $(tool_digest "$f")
        sha="$1"
        size="$2"
        doc=$(derive_doc "$f" "$org" "$code" "$(printf '%s\n' "$prev_version" | tr '-' '.')")
        printf '{"doc":"%s","path":"%s","sha256":"%s","size":%s,"kind":"pdf"}\n' "$doc" "$f" "$sha" "$size"
      done | jq -s '.')

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
                   | .doc = (if ((.doc // "") == "" or ((.doc // "") | contains("#"))) then $t.doc else .doc end)
                   | .url = (.url // null)
                   | .kind = (.kind // $t.kind)
                   else . end)
                   else
                     . + [$t]
                   end
                 ) | sort_by(.path)) |
         .automation = (.automation // {}) |
         .automation.scripts_manifest_sha256 = $manifest' \
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
               | .doc = (if ((.doc // "") == "" or ((.doc // "") | contains("#"))) then $t.doc else .doc end)
               | .url = (.url // null)
               | .kind = (.kind // $t.kind)
               else . end)
               else
                 . + [$t]
               end
             ) | sort_by(.path)) |
     .automation = {scripts_manifest_sha256: $manifest}' \
    "$meta_file" > "$tmp" && mv "$tmp" "$meta_file"
done <<EOF
$meta_files
EOF
echo "OK: refreshed META.audit_hashes, references.tools, and automation pins"

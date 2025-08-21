#!/usr/bin/env bash
set -euo pipefail
j="methodologies/TEMPLATE_METHOD"
s=$(node core/hashing/sha256.js "$j/sections.json")
r=$(node core/hashing/sha256.js "$j/rules.json")
tmp=$(mktemp)
jq ".audit_hashes.sections_json_sha256=\"${s}\" | .audit_hashes.rules_json_sha256=\"${r}\"" \
   "$j/META.json" > "$tmp" && mv "$tmp" "$j/META.json"

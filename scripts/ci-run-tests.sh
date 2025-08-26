#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AJV="$ROOT/scripts/run-ajv.sh"
"$AJV" validate -s "$ROOT/schemas/META.schema.json" -d 'methodologies/**/META.json'
"$AJV" validate -s "$ROOT/schemas/sections.schema.json" -d 'methodologies/**/sections.json'
"$AJV" validate -s "$ROOT/schemas/rules.schema.json" -d 'methodologies/**/rules.json'
if compgen -G 'methodologies/**/sections.rich.json' >/dev/null; then
  "$AJV" validate -s "$ROOT/schemas/sections.rich.schema.json" -d 'methodologies/**/sections.rich.json'
fi
if compgen -G 'methodologies/**/rules.rich.json' >/dev/null; then
  "$AJV" validate -s "$ROOT/schemas/rules.rich.schema.json" -d 'methodologies/**/rules.rich.json'
fi

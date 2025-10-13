#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS_ROOT="$(cd "$DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"
AJV="$SCRIPTS_ROOT/run-ajv.sh"
cd "$REPO_ROOT"
"$AJV" validate -s schemas/sections.schema.json -d 'methodologies/**/sections.json'
"$AJV" validate -s schemas/rules.schema.json -d 'methodologies/**/rules.json'
"$AJV" validate -s schemas/META.schema.json -d 'methodologies/**/META.json'


set -euo pipefail

# Prefer fully offline validation using precompiled validators.
if [ -f scripts/validators/meta.cjs ] && [ -f scripts/validators/sections.cjs ] && [ -f scripts/validators/rules.cjs ]; then
  echo "-- validators present: running offline validation"
  node scripts/validate-offline.js
  exit 0
fi

echo "-- validators missing: skipping npm install to remain offline"
echo "-- tip: run the 'Generate Standalone Validators' workflow to add validators"
exit 0

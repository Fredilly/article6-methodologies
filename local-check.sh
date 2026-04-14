#!/bin/bash
# Local validation - run before pushing to catch CI failures
set -e
cd "$(dirname "$0")"

echo "========================================="
echo "LOCAL VALIDATION"
echo "========================================="

echo ""
echo "1. Validate rich rules..."
npm run validate:rich 2>&1 | tail -3

echo ""
echo "2. Validate lean rules..."
npm run validate:lean 2>&1 | tail -3

echo ""
echo "3. Derive lean from rich..."
node scripts/derive-lean-from-rich.js --include-previous

echo ""
echo "4. Check lean drift..."
if git diff --quiet -- methodologies/**/sections.json methodologies/**/rules.json; then
    echo "Lean drift: NONE"
else
    echo "Lean drift: DETECTED - run node scripts/derive-lean-from-rich.js --include-previous and commit"
    exit 1
fi

echo ""
echo "5. Trio + registry..."
node scripts/check-trio-and-registry.js

echo ""
echo "6. Schema validation..."
node scripts/validate-offline.js 2>&1 | tail -5

echo ""
echo "========================================="
echo "RESULT: ALL PASS"
echo "========================================="

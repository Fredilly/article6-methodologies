#!/usr/bin/env bash
set -euo pipefail

echo "✓ Checking LFS tracking for PDFs…"
git lfs ls-files >/dev/null

ALL=$(find tools -type f -name '*.pdf' | wc -l | tr -d ' ')
LFS=$(git lfs ls-files | wc -l | tr -d ' ')
if [ "$ALL" -gt 0 ] && [ "$LFS" -lt "$ALL" ]; then
  echo "✖ Some PDFs are not tracked by LFS (all:$ALL lfs:$LFS)"; exit 1
fi

echo "✓ Checking for zero-byte sources…"
if find tools -type f \( -name '*.pdf' -o -name '*.docx' \) -size 0 | grep .; then
  echo "✖ Zero-byte file(s) detected under tools/"; exit 1
fi

echo "✓ Checking for empty-file SHA256 (e3b0…)"
BAD=0
while IFS= read -r -d '' f; do
  h=$(shasum -a 256 "$f" | awk '{print $1}')
  if [ "$h" = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ]; then
    echo "✖ Empty-content hash in: $f"; BAD=1
  fi
done < <(find tools -type f \( -name '*.pdf' -o -name '*.docx' \) -print0)
exit $BAD

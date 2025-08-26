#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node scripts/gen-registry.js
git diff --quiet registry.json


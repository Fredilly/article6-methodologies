#!/usr/bin/env bash
set -euo pipefail
VENDOR_DIR="${VENDOR_DIR:-vendor/npm}"

mkdir -p scripts/.node
pushd scripts/.node >/dev/null
npm init -y >/dev/null 2>&1 || true
npm install --no-audit --no-fund --prefer-offline --ignore-scripts --no-package-lock \
  --cache="$PWD/../../$VENDOR_DIR" \
  ../../$VENDOR_DIR/ajv-8.17.1.tgz \
  ../../$VENDOR_DIR/ajv-formats-2.1.1.tgz \
  ../../$VENDOR_DIR/fast-deep-equal-3.1.3.tgz \
  ../../$VENDOR_DIR/json-schema-traverse-1.0.0.tgz \
  ../../$VENDOR_DIR/uri-js-4.4.1.tgz \
  ../../$VENDOR_DIR/require-from-string-2.0.2.tgz
popd >/dev/null
echo "Vendored AJV installed to scripts/.node/node_modules"

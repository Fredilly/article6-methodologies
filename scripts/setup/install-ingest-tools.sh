#!/usr/bin/env bash
set -euo pipefail

BIN=/usr/local/bin
JQ_VER=1.7.1
PUP_VER=0.4.0

sudo apt-get update -y
sudo apt-get install -y curl unzip ca-certificates python3 poppler-utils

curl -fsSL -o /tmp/jq "https://github.com/jqlang/jq/releases/download/jq-${JQ_VER}/jq-linux-amd64"
sudo mv /tmp/jq "${BIN}/jq"
sudo chmod +x "${BIN}/jq"

curl -fsSL -o /tmp/pup.zip "https://github.com/ericchiang/pup/releases/download/v${PUP_VER}/pup_v${PUP_VER}_linux_amd64.zip"
unzip -q /tmp/pup.zip -d /tmp
if [ -f /tmp/pup ]; then
  SRC=/tmp/pup
else
  SRC="$(find /tmp -maxdepth 1 -type f -name 'pup' -path '/tmp/pup_*' | head -n1 || true)"
fi
if [ -z "${SRC:-}" ]; then
  echo "pup binary not found after extraction" >&2
  exit 1
fi
sudo mv "$SRC" "${BIN}/pup"
sudo chmod +x "${BIN}/pup"
rm -f /tmp/pup.zip
rm -rf /tmp/pup_*

echo "[ok] jq $("${BIN}/jq" --version); pup $("${BIN}/pup" --version || true)"

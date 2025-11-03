#!/usr/bin/env bash
set -euo pipefail

BIN=/usr/local/bin
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

JQ_VER=1.7.1
YQ_VER=4.44.3
PUP_VER=0.4.0
PUP_TAG="v${PUP_VER}"

sudo apt-get update -y
sudo apt-get install -y curl unzip ca-certificates coreutils tar

# jq (pinned release)
curl -fsSL -o "${TMP}/jq" "https://github.com/jqlang/jq/releases/download/jq-${JQ_VER}/jq-linux-amd64"
sudo mv "${TMP}/jq" "${BIN}/jq"
sudo chmod +x "${BIN}/jq"

# yq (pinned release; asset name is tar.gz)
curl -fsSL -o "${TMP}/yq.tgz" "https://github.com/mikefarah/yq/releases/download/v${YQ_VER}/yq_linux_amd64.tar.gz"
tar -xzf "${TMP}/yq.tgz" -C "${TMP}"
if [ ! -f "${TMP}/yq_linux_amd64" ]; then
  echo "yq binary not found after extraction" >&2
  exit 1
fi
sudo mv "${TMP}/yq_linux_amd64" "${BIN}/yq"
sudo chmod +x "${BIN}/yq"

# pup (pinned release asset uses leading "v" in filename)
PUP_ASSET="pup_${PUP_TAG}_linux_amd64.zip"
curl -fsSL -o "${TMP}/${PUP_ASSET}" "https://github.com/ericchiang/pup/releases/download/${PUP_TAG}/${PUP_ASSET}"
unzip -q "${TMP}/${PUP_ASSET}" -d "${TMP}"

if [ -f "${TMP}/pup" ]; then
  SRC="${TMP}/pup"
else
  SRC="$(find "${TMP}" -maxdepth 2 -type f -name 'pup' | head -n1 || true)"
fi

if [ -z "${SRC:-}" ]; then
  echo "pup binary not found after extraction" >&2
  exit 1
fi

sudo mv "${SRC}" "${BIN}/pup"
sudo chmod +x "${BIN}/pup"

echo "[ok] jq $("${BIN}/jq" --version); yq $("${BIN}/yq" --version); pup $("${BIN}/pup" --version || true)"

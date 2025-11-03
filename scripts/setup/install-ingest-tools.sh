#!/usr/bin/env bash
set -euo pipefail

JQ_VER=1.7.1
YQ_VER=4.44.3
PUP_VER=0.4.0
PUP_TAG="v${PUP_VER}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN_DIR="${ROOT_DIR}/local-tools/bin"
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t ingest-tools)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$BIN_DIR"

uname_s="$(uname -s)"
case "$uname_s" in
  Linux) OS=linux ;;
  Darwin) OS=darwin ;;
  *)
    echo "Unsupported OS: $uname_s" >&2
    exit 1
    ;;
esac

uname_m="$(uname -m)"
case "$uname_m" in
  x86_64|amd64) ARCH=amd64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *)
    echo "Unsupported architecture: $uname_m" >&2
    exit 1
    ;;
esac

need_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required tool: $1" >&2
    exit 1
  fi
}

need_tool curl
need_tool tar
need_tool unzip

ensure_version() {
  local bin="$1"
  local match="$2"
  if [ -x "$bin" ]; then
    if "$bin" --version 2>/dev/null | grep -Fq "$match"; then
      return 0
    fi
  fi
  return 1
}

install_jq() {
  local dest="${BIN_DIR}/jq"
  local asset_os asset_arch asset url tmp

  if ensure_version "$dest" "jq-${JQ_VER}"; then
    echo "[jq] jq-${JQ_VER} already installed at $dest"
    return
  fi

  asset_os="$OS"
  asset_arch="$ARCH"
  if [ "$OS" = "darwin" ]; then
    asset_os="macos"
  fi
  url="https://github.com/jqlang/jq/releases/download/jq-${JQ_VER}/jq-${asset_os}-${asset_arch}"
  tmp="${TMP_DIR}/jq-${asset_os}-${asset_arch}"
  echo "[jq] downloading jq ${JQ_VER} (${asset_os}/${asset_arch})"
  curl -fsSL -o "$tmp" "$url"
  install -m 0755 "$tmp" "$dest"
  echo "[jq] installed $("$dest" --version)"
}

install_yq() {
  local dest="${BIN_DIR}/yq"
  local asset url archive extracted

  if ensure_version "$dest" "${YQ_VER}"; then
    echo "[yq] yq ${YQ_VER} already installed at $dest"
    return
  fi

  asset="yq_${OS}_${ARCH}.tar.gz"
  if [ "$OS" = "darwin" ] && [ "$ARCH" = "arm64" ]; then
    asset="yq_darwin_arm64.tar.gz"
  fi

  url="https://github.com/mikefarah/yq/releases/download/v${YQ_VER}/${asset}"
  archive="${TMP_DIR}/${asset}"
  echo "[yq] downloading yq ${YQ_VER} (${OS}/${ARCH})"
  curl -fsSL -o "$archive" "$url"
  tar -xzf "$archive" -C "$TMP_DIR"
  extracted="$(find "$TMP_DIR" -maxdepth 2 -type f -name 'yq*' -perm -u+x | head -n1 || true)"
  if [ -z "$extracted" ]; then
    echo "[yq] failed to extract yq binary" >&2
    exit 1
  fi
  install -m 0755 "$extracted" "$dest"
  echo "[yq] installed $("$dest" --version)"
}

build_pup_from_source() {
  local dest="$1"
  local gobin="${TMP_DIR}/go-bin"

  need_tool go
  mkdir -p "$gobin"
  echo "[pup] building from source with go install (GOOS=$OS GOARCH=$ARCH)"
  GOBIN="$gobin" GOOS="$OS" GOARCH="$ARCH" CGO_ENABLED=0 go install "github.com/ericchiang/pup@v${PUP_VER}"
  if [ ! -f "${gobin}/pup" ]; then
    echo "[pup] go install did not produce a pup binary" >&2
    exit 1
  fi
  install -m 0755 "${gobin}/pup" "$dest"
}

install_pup() {
  local dest="${BIN_DIR}/pup"
  local asset_arch asset url archive extracted

  if ensure_version "$dest" "${PUP_VER}"; then
    echo "[pup] pup ${PUP_VER} already installed at $dest"
    return
  fi

  asset_arch="$ARCH"
  if [ "$asset_arch" != "amd64" ]; then
    echo "[pup] pup ${PUP_VER} only provides amd64 binaries; falling back to amd64 build" >&2
    asset_arch="amd64"
  fi

  asset="pup_${PUP_TAG}_${OS}_${asset_arch}.zip"
  url="https://github.com/ericchiang/pup/releases/download/${PUP_TAG}/${asset}"
  archive="${TMP_DIR}/${asset}"

  echo "[pup] downloading pup ${PUP_VER} (${OS}/${asset_arch})"
  curl -fsSL -o "$archive" "$url"
  unzip -q "$archive" -d "$TMP_DIR"
  extracted="$(find "$TMP_DIR" -maxdepth 2 -type f -name 'pup' -perm -u+x | head -n1 || true)"
  if [ -z "$extracted" ]; then
    echo "[pup] failed to extract pup binary" >&2
    build_pup_from_source "$dest"
    echo "[pup] installed $("$dest" --version)"
    return
  fi
  install -m 0755 "$extracted" "$dest"
  if ! "$dest" --version >/dev/null 2>&1; then
    echo "[pup] downloaded binary failed to execute; rebuilding from source" >&2
    build_pup_from_source "$dest"
  fi
  echo "[pup] installed $("$dest" --version)"
}

install_jq
install_yq
install_pup

if [ -n "${GITHUB_PATH:-}" ]; then
  printf '%s\n' "$BIN_DIR" >> "$GITHUB_PATH"
fi

echo "[ok] jq $("${BIN_DIR}/jq" --version); yq $("${BIN_DIR}/yq" --version); pup $("${BIN_DIR}/pup" --version || true)"

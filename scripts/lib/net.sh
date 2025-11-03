#!/usr/bin/env bash
# Shared networking helpers for ingest flows.
# fetch <url> <dest> downloads with retries, forcing HTTP/1.1, IPv4, TLS, and exponential backoff.
# Environment knobs:
#   NO_NETWORK=1       → fail fast without touching the network.
#   NET_RETRY_MAX      → max attempts (default 5)
#   NET_BACKOFF_START  → initial delay seconds (default 2)
#   NET_BACKOFF_FACTOR → backoff multiplier (default 2)
#   FETCH_VERBOSE=1    → verbose logging.
set -uo pipefail

_net_default() {
  local key="$1"
  local fallback="$2"
  if [ -z "${!key+x}" ] || [ -z "${!key}" ]; then
    printf '%s' "$fallback"
  else
    printf '%s' "${!key}"
  fi
}

fetch() {
  if [ "$#" -lt 2 ]; then
    echo "[fetch] usage: fetch <url> <dest>" >&2
    return 2
  fi
  local url="$1"
  local dest="$2"

  if [ "${NO_NETWORK:-0}" = "1" ]; then
    echo "[fetch] NO_NETWORK=1 blocks download of $url" >&2
    return 111
  fi

  local max_attempts; max_attempts="$(_net_default NET_RETRY_MAX 5)"
  local delay; delay="$(_net_default NET_BACKOFF_START 2)"
  local factor; factor="$(_net_default NET_BACKOFF_FACTOR 2)"
  local attempt=1
  local tmp

  mkdir -p "$(dirname "$dest")"
  tmp="$(mktemp "${TMPDIR:-/tmp}/fetch.XXXXXX")"

  while :; do
    if [ "${FETCH_VERBOSE:-0}" = "1" ]; then
      echo "[fetch] attempt ${attempt}/${max_attempts} → $url"
    fi
    if curl --fail --show-error --silent --location \
      --proto '=https' --proto-redir '=https' \
      --http1.1 --ipv4 \
      --connect-timeout 20 --max-time 180 \
      -o "$tmp" "$url"; then
      mv "$tmp" "$dest"
      return 0
    fi

    local status="$?"
    if [ "$attempt" -ge "$max_attempts" ]; then
      rm -f "$tmp"
      echo "[fetch] giving up after ${attempt} attempt(s): $url (exit $status)" >&2
      return "$status"
    fi

    if [ "${FETCH_VERBOSE:-0}" = "1" ]; then
      echo "[fetch] retrying in ${delay}s…" >&2
    fi
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * factor))
  done
}

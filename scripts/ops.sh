#!/usr/bin/env bash
set -euo pipefail

TASK="${1:-}"; shift || true

# Collect args, capture --out if provided (default comes from workflow)
OUTDIR="drafts/ingest/$(date +%F-%H%M%S)"
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUTDIR="$2"; shift 2;;
    *)
      ARGS+=("$1"); shift;;
  esac
done

log() { echo "[$(date +%F\ %T)] $*"; }

case "$TASK" in
  ingest)
    log "ingest -> $OUTDIR  args: ${ARGS[*]:-}"
    mkdir -p "$OUTDIR"
    # Example offline-friendly ingest (adjust flags to match your repo)
    ./scripts/ingest.sh --offline --out "$OUTDIR" "${ARGS[@]}"
    ;;

  derive-lean)
    log "derive-lean -> $OUTDIR  args: ${ARGS[*]:-}"
    mkdir -p "$OUTDIR"
    node scripts/derive-lean-from-rich.js --out "$OUTDIR" "${ARGS[@]}"
    ;;

  validate)
    log "validate (no write)  args: ${ARGS[*]:-}"
    npm run validate:lean || true
    npm run validate:rich || true
    ;;

  *)
    echo "Unknown task: $TASK"; exit 2
    ;;
esac

log "done."


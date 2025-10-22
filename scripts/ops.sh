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

    # Translate CLI flags to envs for ingest.sh
    OFFLINE_ENV=0
    BATCH_ENV=""
    REMAIN=()

    while [[ ${#ARGS[@]} -gt 0 ]]; do
      case "${ARGS[0]}" in
        --offline)
          OFFLINE_ENV=1
          ARGS=("${ARGS[@]:1}")
          ;;
        --batch)
          if [[ ${#ARGS[@]} -lt 2 ]]; then
            echo "Missing value for --batch" >&2; exit 2
          fi
          BATCH_ENV="${ARGS[1]}"
          ARGS=("${ARGS[@]:2}")
          ;;
        *)
          REMAIN+=("${ARGS[0]}")
          ARGS=("${ARGS[@]:1}")
          ;;
      esac
    done

    # Export only what ingest.sh understands; ignore REMAIN for now
    OFFLINE="${OFFLINE_ENV}" BATCH="${BATCH_ENV}" OUTDIR="${OUTDIR}" ./scripts/ingest.sh
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

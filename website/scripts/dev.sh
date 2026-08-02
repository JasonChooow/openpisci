#!/usr/bin/env bash
# Start the marketplace backend + vite dev server in parallel.
#
# Usage:
#   scripts/dev.sh                # start both (default)
#   scripts/dev.sh --backend      # backend only
#   scripts/dev.sh --frontend     # frontend only
#
# Env overrides:
#   PYTHON      — python interpreter (default: python3)
#   MARKET_PORT — backend port (default: 8137)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
PYTHON="${PYTHON:-python3}"
MARKET_PORT="${MARKET_PORT:-8137}"

MODE="both"
case "${1:-}" in
  --backend)  MODE="backend"; shift ;;
  --frontend) MODE="frontend"; shift ;;
  "")         ;;
  -h|--help)
    sed -n '2,10p' "$0"
    exit 0
    ;;
  *)
    echo "unknown flag: $1" >&2
    exit 2
    ;;
esac

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

start_backend() {
  echo "[dev.sh] starting marketplace backend on :$MARKET_PORT"
  (
    cd "$BACKEND"
    exec "$PYTHON" -m uvicorn app.main:app \
        --host 0.0.0.0 --port "$MARKET_PORT" --reload
  ) &
  pids+=($!)
}

start_frontend() {
  echo "[dev.sh] starting vite dev server on :5273"
  (
    cd "$ROOT"
    exec npm run dev
  ) &
  pids+=($!)
}

case "$MODE" in
  backend)  start_backend ;;
  frontend) start_frontend ;;
  both)     start_backend; start_frontend ;;
esac

wait

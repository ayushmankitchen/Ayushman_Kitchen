#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
FRONTEND_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$FRONTEND_DIR/.." && pwd)
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKEND_PYTHON="$BACKEND_DIR/venv/bin/python"
BACKEND_URL="http://localhost:8000/api/health"
BACKEND_PID=""

stop_started_backend() {
  pid="$BACKEND_PID"
  BACKEND_PID=""
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    printf '\nStopping backend started by this command…\n'
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

handle_interrupt() {
  exit 130
}

trap stop_started_backend EXIT
trap handle_interrupt INT TERM

if ! command -v curl >/dev/null 2>&1; then
  printf 'Startup dependency is missing: curl is required for backend health checks.\n' >&2
  exit 1
fi

if [ ! -x "$BACKEND_PYTHON" ]; then
  printf 'Backend environment is missing. Create it in %s/venv first.\n' "$BACKEND_DIR" >&2
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  printf 'Backend configuration is missing: %s/.env\n' "$BACKEND_DIR" >&2
  exit 1
fi

if curl --silent --fail --connect-timeout 2 --max-time 3 "$BACKEND_URL" >/dev/null 2>&1; then
  printf 'Backend is already running at http://localhost:8000\n'
else
  printf 'Starting backend at http://localhost:8000…\n'
  (
    cd "$PROJECT_ROOT"
    exec "$BACKEND_PYTHON" -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
  ) &
  BACKEND_PID=$!

  attempts=0
  while ! curl --silent --fail --connect-timeout 2 --max-time 3 "$BACKEND_URL" >/dev/null 2>&1; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      wait "$BACKEND_PID" || true
      BACKEND_PID=""
      printf 'Backend failed to start. Check the backend error above and backend/.env.\n' >&2
      exit 1
    fi
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      printf 'Backend did not become healthy within 30 seconds. Check MongoDB and backend/.env.\n' >&2
      exit 1
    fi
    sleep 1
  done
  printf 'Backend is ready.\n'
fi

printf 'Starting frontend at http://localhost:3000…\n'
cd "$FRONTEND_DIR"
"$FRONTEND_DIR/node_modules/.bin/craco" start

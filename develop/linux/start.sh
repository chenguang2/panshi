#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKEND_PORT=12344
FRONTEND_PORT=12345

echo "Starting Panshi Admin..."

mkdir -p "$PROJECT_ROOT/backend/data"

UV_BIN="${HOME}/.local/bin/uv"
[ ! -f "$UV_BIN" ] && UV_BIN="uv"

BACKEND_LOG="${PROJECT_ROOT}/backend.log"
FRONTEND_LOG="${PROJECT_ROOT}/frontend.log"

cd "$PROJECT_ROOT/backend" && $UV_BIN run --python /home/qcg/.local/bin/python3.11 uvicorn app.main:app --reload --port "$BACKEND_PORT" >> "$BACKEND_LOG" 2>&1 &

BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

sleep 2

cd "$PROJECT_ROOT/frontend" && npm run dev -- --port "$FRONTEND_PORT" >> "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

echo $BACKEND_PID > /tmp/panshi_backend.pid
echo $FRONTEND_PID > /tmp/panshi_frontend.pid

echo ""
echo "Panshi Admin started!"
echo "- Backend: http://localhost:$BACKEND_PORT (log: $BACKEND_LOG)"
echo "- Frontend: http://localhost:$FRONTEND_PORT (log: $FRONTEND_LOG)"
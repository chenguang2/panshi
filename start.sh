#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting Panshi Admin..."

mkdir -p backend/data

UV_BIN="${HOME}/.local/bin/uv"
[ ! -f "$UV_BIN" ] && UV_BIN="uv"

cd backend && $UV_BIN run uvicorn app.main:app --reload --port 9000 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

sleep 2

cd "$SCRIPT_DIR/frontend" && npm run dev &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

echo $BACKEND_PID > /tmp/panshi_backend.pid
echo $FRONTEND_PID > /tmp/panshi_frontend.pid

echo ""
echo "Panshi Admin started!"
echo "- Backend: http://localhost:9000"
echo "- Frontend: http://localhost:9100"

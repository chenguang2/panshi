#!/bin/bash

BACKEND_PORT=12344
FRONTEND_PORT=12345

echo "Stopping Panshi Admin..."

if [ -f /tmp/panshi_backend.pid ]; then
    kill $(cat /tmp/panshi_backend.pid) 2>/dev/null || true
    rm /tmp/panshi_backend.pid
fi

if [ -f /tmp/panshi_frontend.pid ]; then
    kill $(cat /tmp/panshi_frontend.pid) 2>/dev/null || true
    rm /tmp/panshi_frontend.pid
fi

# 端口兜底停止（带进程名双重确认）
for PORT in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    LSOF_PID=$(lsof -ti:"$PORT" 2>/dev/null)
    if [ -n "$LSOF_PID" ]; then
        if tr '\0' ' ' < "/proc/$LSOF_PID/cmdline" 2>/dev/null | grep -q "app\.main:app\|npm\|vite\|python"; then
            kill -9 "$LSOF_PID" 2>/dev/null || true
        fi
    fi
done

echo "Panshi Admin stopped."
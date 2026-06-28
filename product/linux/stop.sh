#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 默认端口
DEFAULT_PORT=12345

# 端口获取优先级: 参数1 > 环境变量 > 端口文件 > 默认值
PORT_FILE="$PROJECT_ROOT/backend/.port"
PORT="${1:-${PANSHI_PORT:-$(cat "$PORT_FILE" 2>/dev/null || echo $DEFAULT_PORT)}}"

echo "Stopping Panshi Admin (port $PORT)..."

# 通过 PID 文件停止
PID_FILE="$PROJECT_ROOT/backend/.pid"
if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm "$PID_FILE"
fi

# 通过端口强制停止（兜底，带进程名双重确认）
if command -v ss >/dev/null 2>&1; then
    FALLBACK_PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K\d+' | head -1 || true)
elif command -v lsof >/dev/null 2>&1; then
    FALLBACK_PID=$(lsof -ti:"$PORT" 2>/dev/null || true)
fi
if [ -n "$FALLBACK_PID" ]; then
    if tr '\0' ' ' < "/proc/$FALLBACK_PID/cmdline" 2>/dev/null |  grep -q "app\.main:app\|npm\|vite\|python"; then
        kill -9 "$FALLBACK_PID" 2>/dev/null || true
    fi
fi

# 清理端口文件
rm -f "$PORT_FILE"

echo "Panshi Admin stopped."

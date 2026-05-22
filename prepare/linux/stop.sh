#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 默认端口
DEFAULT_PORT=9000

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

# 通过端口强制停止（兜底）
lsof -ti:"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true

# 清理端口文件
rm -f "$PORT_FILE"

echo "Panshi Admin stopped."

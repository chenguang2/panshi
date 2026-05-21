#!/bin/bash

echo "Stopping Panshi Admin..."

# 通过 PID 文件停止
if [ -f /tmp/panshi_backend.pid ]; then
    kill "$(cat /tmp/panshi_backend.pid)" 2>/dev/null || true
    rm /tmp/panshi_backend.pid
fi

# 通过端口强制停止（兜底）
lsof -ti:9000 2>/dev/null | xargs kill -9 2>/dev/null || true

echo "Panshi Admin stopped."

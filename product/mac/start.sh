#!/bin/bash
# ======================================================
# 部署启动脚本 (macOS)
# 功能：在目标 macOS 机器上启动磐石 Admin（离线环境）
# 前提：已通过 product/mac/gen-mac.sh 准备好所有依赖
# 用法：bash start.sh
# ======================================================
set -e

# 默认端口（可在脚本中修改）
DEFAULT_PORT=12345

# 端口获取优先级: 参数1 > 环境变量 > 默认值
PORT="${1:-${PANSHI_PORT:-$DEFAULT_PORT}}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Starting Panshi Admin (deployment mode)..."

# ---------- 路径定义 ----------
PYTHON="$PROJECT_ROOT/backend/.venv/bin/python3"
if [ ! -f "$PYTHON" ]; then
    PYTHON="$PROJECT_ROOT/backend/.venv/bin/python"
fi
if [ ! -f "$PYTHON" ]; then
    echo "错误: 未找到 Python 解释器 ($PYTHON)"
    echo "请先在开发机上运行 bash product/mac/gen-mac.sh"
    exit 1
fi

mkdir -p "$PROJECT_ROOT/backend/data"
mkdir -p /tmp/panshi-cp

cd "$PROJECT_ROOT"
BACKEND_LOG="$PROJECT_ROOT/backend.log"

# ---------- 停止已有进程（带进程名双重确认）----------
PRE_PID=$(lsof -ti:"$PORT" 2>/dev/null)
if [ -n "$PRE_PID" ]; then
    if ps -p "$PRE_PID" -o command= 2>/dev/null | grep -q "app\.main:app"; then
        kill -9 "$PRE_PID" 2>/dev/null || true
    fi
fi
sleep 1

# ---------- 写入端口文件 ----------
PORT_FILE="$PROJECT_ROOT/backend/.port"
echo "$PORT" > "$PORT_FILE"

# ---------- 启动后端（自动托管前端 dist/ 静态文件）----------
echo ""
echo "Starting Backend (port $PORT)..."
# standalone Python 内置了 /install 硬编码路径，设 PYTHONHOME 指向项目内 Python
export PYTHONHOME="$PROJECT_ROOT/backend/python"
cd "$PROJECT_ROOT/backend"
nohup "$PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" >> "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "  Backend started (PID: $BACKEND_PID)"
echo $BACKEND_PID > "$PROJECT_ROOT/backend/.pid"

# ---------- 验证 ----------
sleep 3
BK_CHECK=0
# macOS 使用 lsof 检查端口监听
if lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -q ":$PORT "; then
    BK_CHECK=1
fi

echo ""
echo "=========================================="
echo "  Panshi Admin started!"
echo "=========================================="
echo "  URL:   http://localhost:$PORT"
echo "  Login: admin / panshi123"
echo "  Log:   $BACKEND_LOG"
echo ""
if [ "$BK_CHECK" -eq 0 ]; then
    echo "⚠  Warning: 可能未监听 $PORT 端口，请查看日志:"
    echo "   tail -50 $BACKEND_LOG"
fi
echo ""
echo "停止服务: bash stop.sh"

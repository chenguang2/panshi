#!/bin/bash
# ======================================================
# 部署准备脚本 (Linux)
# 功能：在开发机上准备好所有依赖，打包后拷贝到目标 Linux 机器即可运行
# 要求：开发机需安装 uv 和 npm（有公网访问）
# 用法：bash prepare/linux/prepare.sh
# ======================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================="
echo "  部署准备脚本 (Linux)"
echo "  项目根目录: $PROJECT_ROOT"
echo "=========================================="

# ---------- 前置检查 ----------
echo ""
echo "[检查] uv 是否安装..."
if ! command -v uv &>/dev/null; then
    echo "错误: 请先安装 uv → https://docs.astral.sh/uv/"
    exit 1
fi

echo "[检查] npm 是否安装..."
if ! command -v npm &>/dev/null; then
    echo "错误: 请先安装 Node.js/npm"
    exit 1
fi

# ---------- 1. 下载 standalone Python 3.11 ----------
echo ""
echo "[1/4] 准备 Python 3.11 解释器..."
uv python install 3.11
PYTHON_BIN=$(uv python find 3.11 | head -1)
if [ -z "$PYTHON_BIN" ]; then
    echo "错误: 无法找到 Python 3.11"
    exit 1
fi
echo "  源路径: $PYTHON_BIN"

# 拷贝 Python 整个目录到 backend/python/
PYTHON_DIR=$(dirname "$(dirname "$PYTHON_BIN")")
TARGET_PYTHON_DIR="$PROJECT_ROOT/backend/python"
rm -rf "$TARGET_PYTHON_DIR"
cp -r "$PYTHON_DIR" "$TARGET_PYTHON_DIR"
echo "  已拷贝到: $TARGET_PYTHON_DIR"

# ---------- 2. 创建 .venv（--copies 确保是文件副本，非符号链接）----------
echo ""
echo "[2/4] 创建虚拟环境..."
cd "$PROJECT_ROOT/backend"
if [ -d ".venv" ]; then
    rm -rf ".venv"
fi
"$TARGET_PYTHON_DIR/bin/python3" -m venv --copies .venv
echo "  .venv 已创建"

# ---------- 3. 安装后端依赖 ----------
echo ""
echo "[3/4] 安装后端依赖..."
"$PROJECT_ROOT/backend/.venv/bin/pip" install -e "$PROJECT_ROOT/backend"
echo "  后端依赖安装完成"

# ---------- 4. 构建前端 ----------
echo ""
echo "[4/4] 构建前端..."
cd "$PROJECT_ROOT/frontend"
npm install
npm run build:deploy
echo "  前端构建完成 → frontend/dist/"

# ---------- 完成 ----------
echo ""
echo "=========================================="
echo "  准备完成！"
echo "=========================================="
echo ""
echo "部署步骤："
echo "  1. 将整个项目目录拷贝到目标 Linux 机器"
echo "     (可以排除 node_modules/，仅部署需要)"
echo "  2. 在目标机器上运行启动脚本:"
echo "     bash prepare/linux/start.sh"
echo ""
echo "目标机器不需要安装 uv、npm、Python、Node.js"
echo "目标机器不需要公网访问"

#!/bin/bash
# ======================================================
# 部署准备脚本 (Linux)
# 功能：在开发机上准备好所有依赖，生成离线部署包到 product/linux/panshi/
# 要求：开发机需安装 uv 和 npm（有公网访问）
# 用法：bash product/linux/gen-linux.sh
# ======================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DIR="$SCRIPT_DIR/panshi"

echo "=========================================="
echo "  部署准备脚本 (Linux)"
echo "  输出目录: $TARGET_DIR"
echo "=========================================="

# ---------- 前置检查 ----------
echo ""
echo "[检查] uv 是否安装..."
if ! command -v uv >/dev/null 2>&1; then
    echo "错误: 请先安装 uv → https://docs.astral.sh/uv/"
    exit 1
fi

echo "[检查] npm 是否安装..."
if ! command -v npm >/dev/null 2>&1; then
    echo "错误: 请先安装 Node.js/npm"
    exit 1
fi

# ---------- 0. 清理并创建目标目录结构 ----------
echo ""
echo "[0/5] 创建输出目录结构..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR/backend/data"
mkdir -p "$TARGET_DIR/frontend/dist"

# ---------- 1. 拷贝后端源代码（排除开发工件）----------
echo ""
echo "[1/5] 拷贝后端源代码..."
cp -r "$PROJECT_ROOT/backend/app" "$TARGET_DIR/backend/"
cp -r "$PROJECT_ROOT/backend/ansible" "$TARGET_DIR/backend/"
cp "$PROJECT_ROOT/backend/pyproject.toml" "$TARGET_DIR/backend/"
# 清理开发/构建副产品
find "$TARGET_DIR/backend/app" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$TARGET_DIR/backend/app" -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
find "$TARGET_DIR/backend/app" -name "*.pyc" -delete 2>/dev/null || true
echo "  后端源代码已拷贝到: $TARGET_DIR/backend/"

# ---------- 2. 下载 standalone Python 3.11 ----------
echo ""
echo "[2/5] 准备 Python 3.11 解释器..."
uv python install 3.11
PYTHON_BIN=$(uv python find 3.11 | head -1)
if [ -z "$PYTHON_BIN" ]; then
    echo "错误: 无法找到 Python 3.11"
    exit 1
fi
echo "  源路径: $PYTHON_BIN"

# 拷贝 Python 整个目录到目标（-rL: 跟踪符号链接，拷贝实际内容）
PYTHON_DIR=$(dirname "$(dirname "$PYTHON_BIN")")
TARGET_PYTHON_DIR="$TARGET_DIR/backend/python"
cp -rL "$PYTHON_DIR" "$TARGET_PYTHON_DIR"
chmod -R u+rwX,go+rX "$TARGET_PYTHON_DIR"
echo "  已拷贝到: $TARGET_PYTHON_DIR"

# ---------- 3. 创建 .venv（--copies 确保是文件副本，非符号链接）----------
echo ""
echo "[3/5] 创建虚拟环境..."
"$TARGET_PYTHON_DIR/bin/python3" -m venv --copies "$TARGET_DIR/backend/.venv"
echo "  .venv 已创建"

# ---------- 4. 安装后端依赖 ----------
echo ""
echo "[4/5] 安装后端依赖..."
# standalone Python 内置了 /install 硬编码路径，设 PYTHONHOME 强制指向拷贝后的 Python
export PYTHONHOME="$TARGET_PYTHON_DIR"
echo "  使用清华 PyPI 镜像..."
"$TARGET_DIR/backend/.venv/bin/pip" install -i https://pypi.tuna.tsinghua.edu.cn/simple -e "$TARGET_DIR/backend"
unset PYTHONHOME
echo "  后端依赖安装完成"

# ---------- 4.5 修正 editable install 的 .pth 为相对路径 ----------
# 使部署目录可以迁移到目标机器的任意路径，不依赖开发机绝对位置
echo ""
echo "[4.5/5] 修正路径为相对路径..."
SITE_PKG_DIR=$(find "$TARGET_DIR/backend/.venv" -path "*/site-packages" -type d 2>/dev/null | head -1)
if [ -n "$SITE_PKG_DIR" ]; then
    PTH_FILE=$(ls "$SITE_PKG_DIR"/__editable__*.pth 2>/dev/null | head -1)
    if [ -n "$PTH_FILE" ]; then
        "$TARGET_PYTHON_DIR/bin/python3" -c "
import os
pth_file = '$PTH_FILE'
target = '$TARGET_DIR/backend/app'
site_pkg = os.path.dirname(pth_file)
rel = os.path.relpath(target, site_pkg)
with open(pth_file, 'w') as f:
    f.write(rel + '\n')
print('  .pth 已修正为相对路径: ' + rel)
"
    fi
fi
echo "  路径修正完成"

# ---------- 5. 构建前端 ----------
echo ""
echo "[5/5] 构建前端..."
cd "$PROJECT_ROOT/frontend"
echo "  使用清华 npm 镜像..."
npm install --registry=https://registry.npmmirror.com
npm run build
# 将构建产物拷贝到部署目录
cp -r "$PROJECT_ROOT/frontend/dist/"* "$TARGET_DIR/frontend/dist/"
echo "  前端构建产物已拷贝到: $TARGET_DIR/frontend/dist/"

# ---------- 拷贝启停脚本 ----------
echo ""
echo "拷贝启停脚本..."
# 复制时修正 PROJECT_ROOT 路径：部署目录本身即项目根
cp "$SCRIPT_DIR/start.sh" "$TARGET_DIR/"
cp "$SCRIPT_DIR/stop.sh" "$TARGET_DIR/"
sed -i 's|SCRIPT_DIR/\.\./\.\.|SCRIPT_DIR|' "$TARGET_DIR/start.sh"
sed -i 's|SCRIPT_DIR/\.\./\.\.|SCRIPT_DIR|' "$TARGET_DIR/stop.sh"
# 修正目标脚本中 prepare/linux/ 路径为当前目录
sed -i 's|bash prepare/linux/stop.sh|bash stop.sh|' "$TARGET_DIR/start.sh"
sed -i 's|prepare/linux/prepare.sh|product/linux/gen-linux.sh|' "$TARGET_DIR/start.sh"
sed -i 's|用法：bash prepare/linux/start.sh|用法：bash start.sh|' "$TARGET_DIR/start.sh"
echo "  启停脚本已拷贝到: $TARGET_DIR/"

# 创建 data/.gitkeep（空目录占位）
touch "$TARGET_DIR/backend/data/.gitkeep"

# ---------- 完成 ----------
echo ""
echo "=========================================="
echo "  生成完成！"
echo "=========================================="
echo ""
echo "部署步骤："
echo "  1. 将 product/linux/panshi/ 目录拷贝到目标 Linux 机器"
echo "     scp -r product/linux/panshi user@target:~"
echo "  2. 在目标机器上进入目录并启动:"
echo "     cd panshi && bash start.sh"
echo ""
echo "目标机器不需要安装 uv、npm、Python、Node.js"
echo "目标机器不需要公网访问"

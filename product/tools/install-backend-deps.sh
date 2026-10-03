#!/usr/bin/env bash
# 产品后端依赖安装统一入口（中期方案：uv 优先 / pip 退化 / WHEELS_DIR 完全离线）。
#
# 被 product/linux/gen-linux.sh 第 4 步调用，也可单独执行：
#   ./install-backend-deps.sh <TARGET_DIR>              # TARGET_DIR = 含 backend/ 的产品目录
#   WHEELS_DIR=/path/to/wheels ./install-backend-deps.sh <TARGET_DIR>   # 离线模式
#
# 三种模式（优先级从高到低）：
#   1. 设了 WHEELS_DIR 且目录存在 → 完全离线：--no-index --find-links 装 setuptools/wheel
#      后以 --no-build-isolation 装 -e 后端（build 不再触发联网解析——tuna 403 的出错点）。
#      wheels 目录由 vendor-wheels.sh 生成。
#   2. PATH 上有 uv → uv pip install：缓存激进（~/.cache/uv 复用）、解析快。
#   3. 退化 pip：与旧流程等价，仅镜像换成可配置。
#
# 注意：standalone Python 的 PYTHONHOME 导出由调用方（gen-linux.sh）负责，本脚本原样继承。
set -euo pipefail

TARGET_DIR="${1:?用法: install-backend-deps.sh <TARGET_DIR> [含 backend/ 的产品目录]}"
BACKEND="$TARGET_DIR/backend"
VENV_PY="$BACKEND/.venv/bin/python"
MIRROR="${PIP_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple/}"

# 覆盖机器环境的镜像变量（本机 UV_INDEX_URL 指向已限流的 tuna，2026-10-03 实测）：
# 进程树内所有 uv/pip 调用统一走 MIRROR，新旧变量名双保险。
export UV_DEFAULT_INDEX="$MIRROR" UV_INDEX_URL="$MIRROR" PIP_INDEX_URL="$MIRROR"

[[ -x "$VENV_PY" ]] || { echo "错误: 未找到产品 venv Python: $VENV_PY" >&2; exit 1; }
[[ -f "$BACKEND/pyproject.toml" ]] || { echo "错误: 未找到 $BACKEND/pyproject.toml" >&2; exit 1; }

if [[ -n "${WHEELS_DIR:-}" ]]; then
    [[ -d "$WHEELS_DIR" ]] || { echo "错误: WHEELS_DIR=$WHEELS_DIR 不是目录" >&2; exit 1; }
    echo "  [离线模式] wheels: $WHEELS_DIR"
    "$VENV_PY" -m pip install --no-index --find-links "$WHEELS_DIR" setuptools wheel
    "$VENV_PY" -m pip install --no-index --find-links "$WHEELS_DIR" \
        --no-build-isolation -e "$BACKEND"
elif command -v uv >/dev/null 2>&1; then
    echo "  [uv 模式] mirror: $MIRROR"
    uv pip install --python "$VENV_PY" --index-url "$MIRROR" -e "$BACKEND"
else
    echo "  [pip 退化模式] mirror: $MIRROR"
    "$VENV_PY" -m pip install -i "$MIRROR" -e "$BACKEND"
fi
echo "  后端依赖安装完成"

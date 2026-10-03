#!/usr/bin/env bash
# 后端依赖 wheel 本地落盘（长期方案：离线可复现打包，免疫镜像限流/断网）。
#
# 产出（默认 <repo>/product/wheels/，已加 .gitignore 属本机缓存，可随时重跑本脚本重建）：
#   requirements.lock.txt  —— uv 按当前 backend/pyproject.toml 锁定的全量依赖清单
#   *.whl / *.tar.gz       —— 全套构件（含 setuptools/wheel，供离线 --no-build-isolation）
#
# 与 install-backend-deps.sh 配对使用：
#   ./vendor-wheels.sh                                   # 生成/刷新落盘
#   WHEELS_DIR=<repo>/product/wheels ./install-backend-deps.sh <TARGET_DIR>   # 离线安装
#
# 注意：
#   - wheel 按平台绑定：本机(x86_64 linux)落盘只能喂 gen-linux；mac/windows 需各自平台落盘。
#   - 锁定基于本机 pyproject——若目标机 glibc<2.28 需 greenlet 降级（见 gen-linux.sh），
#     改完 pyproject 后重跑本脚本刷新锁。
#   - pyproject 依赖变更后必须重跑（否则离线装的是旧依赖集）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WHEELS_DIR="${WHEELS_DIR:-$REPO_ROOT/product/wheels}"
PY_VER="${PY_VER:-3.11}"
# 镜像优先级：PIP_INDEX_URL 环境变量 > switch-pypi-mirror.sh 落盘的 .mirror > aliyun 兜底
MIRROR="${PIP_INDEX_URL:-$(cat "$SCRIPT_DIR/.mirror" 2>/dev/null || true)}"
MIRROR="${MIRROR:-https://mirrors.aliyun.com/pypi/simple/}"

# 机器环境可能把 UV_INDEX_URL 指向已限流镜像（本机 tuna 渐进式 403，2026-10-03 实测，
# uv venv --seed 无显式 index 时继承它而挂）——进程树内统一覆盖为 MIRROR，新旧变量名双保险。
export UV_DEFAULT_INDEX="$MIRROR" UV_INDEX_URL="$MIRROR" PIP_INDEX_URL="$MIRROR"

mkdir -p "$WHEELS_DIR"
echo "[1/3] uv 锁定依赖 → $WHEELS_DIR/requirements.lock.txt"
uv pip compile "$REPO_ROOT/backend/pyproject.toml" \
    --python-version "$PY_VER" --index-url "$MIRROR" \
    -o "$WHEELS_DIR/requirements.lock.txt"

echo "[2/3] 准备落盘用 pip（uv venv --seed，自带 pip）"
# 勿硬编码不存在的父目录：mktemp 不会自建父级（曾写死 /tmp/opencode 导致用户环境必挂）
TMP_BASE="${TMPDIR:-/tmp}"
PIP_VENV="$(mktemp -d "$TMP_BASE/vendor-pip.XXXXXX")"
DL_LOG="$TMP_BASE/vendor-dl.$$.log"
trap 'rm -rf "$PIP_VENV"; rm -f "$DL_LOG"' EXIT
uv venv --python "$PY_VER" --seed "$PIP_VENV" >/dev/null
PIP_BIN="$PIP_VENV/bin/pip"

echo "[3/3] 下载全量 wheel → $WHEELS_DIR（镜像: $MIRROR）"
# 优先纯 wheel（离线装不再需要构建链）；个别仅 sdist 的包回退放行（pip 可用 venv 内
# setuptools 离线构建，setuptools/wheel 已在落盘集里）
if ! "$PIP_BIN" download -r "$WHEELS_DIR/requirements.lock.txt" \
        -d "$WHEELS_DIR" --index-url "$MIRROR" \
        --python-version "$PY_VER" --only-binary=:all: 2>"$DL_LOG"; then
    echo "  [提示] 存在仅 sdist 的依赖，回退允许源码包（离线构建依赖 setuptools 已落盘）"
    tail -5 "$DL_LOG" >&2
    "$PIP_BIN" download -r "$WHEELS_DIR/requirements.lock.txt" \
        -d "$WHEELS_DIR" --index-url "$MIRROR" --python-version "$PY_VER"
fi
"$PIP_BIN" download setuptools wheel -d "$WHEELS_DIR" --index-url "$MIRROR" \
    --python-version "$PY_VER" --only-binary=:all:

count=$(ls "$WHEELS_DIR" | grep -Ec '\.(whl|tar\.gz)$' || true)
size=$(du -sh "$WHEELS_DIR" | cut -f1)
echo ""
echo "落盘完成: $count 个构件, 共 $size → $WHEELS_DIR"
echo "离线安装: WHEELS_DIR=$WHEELS_DIR ./install-backend-deps.sh <TARGET_DIR>"

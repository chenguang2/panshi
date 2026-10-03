#!/usr/bin/env bash
# 一键替换三个打包脚本的 PyPI 镜像源（短期方案：tuna 限流 403 → aliyun）。
#
# 背景（2026-10-03）：pypi.tuna 对本机出口 IP 渐进式 403（索引/包均拒、pip UA 拦截更狠），
# aliyun 实测全通。三个 gen 脚本把镜像硬编码在 install 命令行里，本脚本统一改写。
#
# 用法：
#   ./switch-pypi-mirror.sh [镜像URL]        # 缺省 https://mirrors.aliyun.com/pypi/simple/
# 幂等：重复执行把任何已写死的镜像换成目标源（已是目标则无变化）。
set -euo pipefail

TARGET_MIRROR="${1:-https://mirrors.aliyun.com/pypi/simple/}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILES=(
    "$SCRIPT_DIR/../linux/gen-linux.sh"
    "$SCRIPT_DIR/../mac/gen-mac.sh"
    "$SCRIPT_DIR/../windows/gen-window.ps1"
)

echo "目标镜像: $TARGET_MIRROR"
total=0
for f in "${FILES[@]}"; do
    if [[ ! -f "$f" ]]; then
        echo "  [跳过] $f 不存在"
        continue
    fi
    # 匹配 install 命令行上的 -i <任意URL>（三脚本同形态：install -i https://... -e ...）。
    # URL 以空白收界，用 [^[:space:]]* 即可——勿在双引号 sed 里写含引号的字符类（曾因
    # 多写一个 ] 只吞一个字符，把三脚本改成叠垃圾前缀且复跑不幂等，2026-10-03 实发）。
    count=$(grep -c -- '-i https\?://' "$f" || true)
    if [[ "$count" -eq 0 ]]; then
        echo "  [无匹配] $f（可能已改用 product/tools/install-backend-deps.sh 统一入口）"
        continue
    fi
    sed -i "s|-i https://[^[:space:]]*|-i $TARGET_MIRROR|g" "$f"
    # 诚实校验：残留的非目标镜像引用数必须为 0
    stale=$(grep -E -- '-i https?://' "$f" | grep -vc -F -- "-i $TARGET_MIRROR" || true)
    if [[ "$stale" -ne 0 ]]; then
        echo "  [异常] $f 仍有 $stale 处非目标镜像，请人工检查" >&2
        exit 1
    fi
    echo "  [已替换] $f：$count 处 → 全部为目标镜像"
    total=$((total + count))
done

echo "完成：共改写 $total 处。验证："
grep -rn -- '-i http' "${FILES[@]}" 2>/dev/null || echo "  （无残留 -i 引用）"

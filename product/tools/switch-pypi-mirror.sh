#!/usr/bin/env bash
# 国内 PyPI 镜像一键切换（预置列表选择，无需手输 URL）。
#
# 用法：
#   ./switch-pypi-mirror.sh              # 交互菜单选择
#   ./switch-pypi-mirror.sh aliyun       # 按名称直选
#   ./switch-pypi-mirror.sh 2            # 按序号直选
#   ./switch-pypi-mirror.sh https://…    # 传完整 URL 用自定义源
#
# 作用对象：三个打包脚本里硬编码的 `-i <镜像>` ——
#   product/linux/gen-linux.sh、product/mac/gen-mac.sh、product/windows/gen-window.ps1
# 幂等可重复执行；改写后校验「非目标镜像残留数必须为 0」。
#
# 预置镜像可用性为 2026-10-03 包级路径（/simple/<pkg>/，pip 实际访问形态）实测：
# aliyun/tencent/ustc/huawei 均 200；tsinghua(tuna) 对本机出口 403（其他机器可用）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_FILES=(
    "$SCRIPT_DIR/../linux/gen-linux.sh"
    "$SCRIPT_DIR/../mac/gen-mac.sh"
    "$SCRIPT_DIR/../windows/gen-window.ps1"
)

# 名称|显示名|URL
MIRRORS=(
    "aliyun|阿里云|https://mirrors.aliyun.com/pypi/simple/"
    "tencent|腾讯云|https://mirrors.cloud.tencent.com/pypi/simple/"
    "ustc|中科大|https://mirrors.ustc.edu.cn/pypi/simple/"
    "huawei|华为云|https://repo.huaweicloud.com/repository/pypi/simple"
    "tsinghua|清华 tuna|https://pypi.tuna.tsinghua.edu.cn/simple"
)

print_menu() {
    echo "可选国内 PyPI 镜像："
    local i=1 m
    for m in "${MIRRORS[@]}"; do
        IFS='|' read -r key label url <<<"$m"
        printf '  %d) %-9s %-10s %s\n' "$i" "$key" "$label" "$url"
        i=$((i + 1))
    done
    echo "也可直接传镜像名称 / 序号 / 完整 URL。"
}

# 参数 → URL（名称或序号匹配预置表；http(s):// 开头视为自定义 URL 原样透传）
resolve_target() {
    local sel="$1" i=1 m
    if [[ "$sel" == http://* || "$sel" == https://* ]]; then
        echo "$sel"
        return 0
    fi
    for m in "${MIRRORS[@]}"; do
        IFS='|' read -r key label url <<<"$m"
        if [[ "$sel" == "$key" || "$sel" == "$i" ]]; then
            echo "$url"
            return 0
        fi
        i=$((i + 1))
    done
    return 1
}

if [[ $# -ge 1 ]]; then
    TARGET_MIRROR="$(resolve_target "$1")" || {
        echo "错误: 无法识别的镜像 '$1'" >&2
        print_menu >&2
        exit 1
    }
else
    print_menu
    if ! read -r -p "请选择镜像 [1-${#MIRRORS[@]}，或输入完整 URL]：" SEL; then
        echo "未收到输入，退出。" >&2
        exit 1
    fi
    SEL="${SEL//[[:space:]]/}"
    [[ -n "$SEL" ]] || { echo "未选择，退出。" >&2; exit 1; }
    TARGET_MIRROR="$(resolve_target "$SEL")" || {
        echo "错误: 无法识别的选择 '$SEL'" >&2
        exit 1
    }
fi

echo "目标镜像: $TARGET_MIRROR"
total=0
for f in "${TARGET_FILES[@]}"; do
    [[ -f "$f" ]] || { echo "  [跳过] $f 不存在" >&2; continue; }
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
grep -n -- '-i http' "${TARGET_FILES[@]}" 2>/dev/null || true
# 持久化选择：install-backend-deps.sh / vendor-wheels.sh 读取 .mirror 作为缺省镜像
# （gen-linux.sh 已改调 helper，其镜像不再由 sed 控制，须经此文件传导）
printf '%s\n' "$TARGET_MIRROR" >"$SCRIPT_DIR/.mirror"
echo "已写入缺省镜像 → $SCRIPT_DIR/.mirror（helper/vendor 自动生效）"

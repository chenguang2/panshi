#!/bin/bash
# software_check.sh — 检测软件是否安装及版本（跨发行版/多架构）
# usage: software_check.sh <cmd1>,<cmd2>,...
# 三通道检测:
#   1. command -v        — 命令存在性（已安装判定）
#   2. rpm -qf / dpkg -S — 包版本（RHEL系 / Debian系，反查实际包名）
#   3. --version/-v/-V   — 命令自报版本
# 输出: OK|<命令>|<包版本>|<命令版本>  或  MISS|<命令>|未安装||

if [ $# -eq 0 ]; then
    echo "Usage: $0 <cmd1>,<cmd2>,..."
    exit 1
fi

IFS=',' read -ra cmds <<< "$1"

for name in "${cmds[@]}"; do
    name=$(echo "$name" | xargs)
    [ -z "$name" ] && continue

    bin=$(command -v "$name" 2>/dev/null)
    if [ -z "$bin" ]; then
        echo "MISS|$name|未安装||"
        continue
    fi

    # 通道 2: 包版本（仅当 bin 存在才反查，shell 内建/无 bin 时跳过）
    pkg=""
    if [ -n "$bin" ]; then
        pkg=$(rpm -qf "$bin" 2>/dev/null | head -1)
        [ -z "$pkg" ] && pkg=$(dpkg -S "$bin" 2>/dev/null | awk -F: '{print $1}' | head -1)
    fi
    [ -z "$pkg" ] && pkg="无包信息"

    # 通道 3: 命令自报版本（多格式 fallback）
    ver=$("$name" --version 2>/dev/null | head -1)
    [ -z "$ver" ] && ver=$("$name" -v 2>&1 | head -1)
    [ -z "$ver" ] && ver=$("$name" -V 2>&1 | head -1)
    [ -z "$ver" ] && ver="无版本输出"

    echo "OK|$name|$pkg|$ver"
done

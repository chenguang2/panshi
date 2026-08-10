#!/bin/bash
# cmd_exec.sh — 节点任务「命令执行」安全脚本（三策略 + 超时）
# usage: cmd_exec.sh '<security>' '<timeout>' '<base64_cmd>' '<base64_whitelist>'
#   security : blacklist | whitelist | none
#   timeout  : 命令超时秒数（整数）
#   base64_cmd      : 要执行的命令（base64 编码，防空格/引号/特殊字符损坏）
#   base64_whitelist: 白名单附加命令列表（逗号分隔，base64 编码，仅本次任务）
#
# 三策略（讨论确认）:
#   blacklist — 禁注入字符 + 禁危险命令（rm/reboot/shutdown/halt/mkfs/fsck/dd/format/fdisk/parted）
#   whitelist — 仅允许白名单命令（内置只读 + 任务添加），叠加注入校验（校验=执行一致）
#   none      — 不校验（由运维负责，超时兜底）
# 输出: 命令 stdout；超时(124)提示"命令超时"；失败提示 exit 码；拦截提示 ERROR。

set -u

SECURITY="${1:-}"
TIMEOUT="${2:-30}"
CMD_B64="${3:-}"
WL_B64="${4:-}"

if [ -z "$SECURITY" ] || [ -z "$CMD_B64" ]; then
    echo "ERROR: usage: cmd_exec.sh <security> <timeout> <base64_cmd> <base64_whitelist>"
    exit 1
fi

CMD=$(printf '%s' "$CMD_B64" | base64 -d 2>/dev/null) || {
    echo "ERROR: base64 解码命令失败"; exit 1; }
WL_LIST=$(printf '%s' "$WL_B64" | base64 -d 2>/dev/null || true)
[ -z "$WL_LIST" ] && WL_LIST=""

# 注入字符 + 危险命令正则（黑名单 + 白名单共用，保证校验=执行一致）
# 注：换行符单独检测（ERE 中 \n 匹配字面 n，非换行）
INJECT_RE='\||>|>>|<|&|\$\{|;|`|&&|\$\(|\brm\b|\breboot\b|\bshutdown\b|\bhalt\b|\bmkfs\b|\bfsck\b|\bdd\b|\bformat\b|\bfdisk\b|\bparted\b'
# 白名单模式变体：放行管道 |（ps -ef|grep -a nginx 属只读管道，任务 6 场景），
# 其余注入字符与危险命令仍拦截；管道各段命令须分别命中白名单（校验=执行一致）。
INJECT_RE_WL='>|>>|<|&|\$\{|;|`|&&|\$\(|\brm\b|\breboot\b|\bshutdown\b|\bhalt\b|\bmkfs\b|\bfsck\b|\bdd\b|\bformat\b|\bfdisk\b|\bparted\b'

has_inject() {
    [ -z "$1" ] && return 1
    printf '%s' "$1" | grep -qE "$INJECT_RE" && return 0
    case "$1" in
        *$'\n'*) return 0 ;;
    esac
    return 1
}

has_inject_wl() {
    [ -z "$1" ] && return 1
    printf '%s' "$1" | grep -qE "$INJECT_RE_WL" && return 0
    case "$1" in
        *$'\n'*) return 0 ;;
    esac
    return 1
}

case "$SECURITY" in
  blacklist)
    if has_inject "$CMD"; then
        echo "ERROR: 命令含危险字符或危险命令"
        exit 1
    fi
    ;;
  whitelist)
    # 叠加注入校验（评审确认：防 ls; whoami 绕过）——白名单模式放行管道 |，
    # 但管道各段命令必须分别命中白名单（校验=执行一致，防 ls|whoami 绕过）。
    if has_inject_wl "$CMD"; then
        echo "ERROR: 白名单命令含注入字符"
        exit 1
    fi
    # 按 | 分段逐段校验首词命中白名单（tr 转分行避免 glob 展开；
    # printf 末尾补换行，否则 read 读到最后一段无换行时返回非零、循环体被跳过）
    while IFS= read -r seg; do
        BIN=$(printf '%s' "$seg" | awk '{print $1}')
        if ! printf '%s' "$WL_LIST" | grep -qE "(^|,)$BIN(,|$)"; then
            echo "ERROR: 命令 $BIN 不在白名单"
            exit 1
        fi
    done < <(printf '%s\n' "$CMD" | tr '|' '\n')
    ;;
  none) ;;
  *)
    echo "ERROR: 未知安全策略: $SECURITY"
    exit 1
    ;;
esac

OUT=$(timeout "$TIMEOUT" bash -c "$CMD" 2>&1)
RC=$?
if [ "$RC" -eq 124 ]; then
    echo "ERROR: 命令超时（>$TIMEOUT 秒）"
elif [ "$RC" -ne 0 ]; then
    echo "ERROR: 命令执行失败 (exit=$RC)"
fi
printf '%s\n' "$OUT"
exit "$RC"

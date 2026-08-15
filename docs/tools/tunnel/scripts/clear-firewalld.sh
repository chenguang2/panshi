#!/bin/bash
# ============================================================
# 清除三台服务器 (13/14/15) 的 firewalld 出站隔离规则（恢复全放行）
# 用法: ./clear-firewalld.sh        # 从工作站执行，密码用 SSH_PASS 覆盖
# 说明:
#   - 仅移除 firewalld direct 规则（隔离规则），firewalld 保持运行
#   - trusted 区 = 入站全放行；执行后三台无任何方向限制
#   - 不影响 gost 隧道进程（如需停止隧道用 stop-tunnel.sh）
#   - 如需恢复隔离: 各机执行 ./setup-firewalld.sh
# ============================================================
set -u
SSH_PASS="${SSH_PASS:-linux123!@#}"
HOSTS="13 14 15"
TO=12

sshx() { timeout "$TO" sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=6 -o LogLevel=ERROR "$@"; }

echo "==================== 清除三台 firewalld 隔离规则 ===================="
for h in $HOSTS; do
  echo "--- 192.168.0.$h ---"
  sshx root@192.168.0.$h '
    firewall-cmd --permanent --direct --remove-rules ipv4 filter OUTPUT 2>/dev/null
    firewall-cmd --permanent --direct --remove-rules ipv4 filter INPUT 2>/dev/null
    firewall-cmd --permanent --direct --remove-rules ipv4 filter FORWARD 2>/dev/null
    firewall-cmd --permanent --direct --remove-rules ipv6 filter OUTPUT 2>/dev/null
    firewall-cmd --reload 2>/dev/null
    echo "  direct rules: [$(firewall-cmd --direct --get-all-rules 2>/dev/null)]"
  ' 2>/dev/null
done
echo "[+] 完成：三台防火墙隔离规则已清除（全放行）"

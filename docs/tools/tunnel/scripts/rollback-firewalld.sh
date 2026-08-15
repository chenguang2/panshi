#!/bin/bash
# ============================================================
# 回滚防火墙: 停用 firewalld，恢复 iptables 备份
# 用法: ./rollback-firewalld.sh     # 在目标主机上执行
# 前置: 转换前已用 iptables-save 备份到 /root/iptables-backup-before-firewalld.rules
# ============================================================
set -e
BK=/root/iptables-backup-before-firewalld.rules
[ -f "$BK" ] || { echo "[!] 备份文件不存在: $BK"; exit 1; }

echo "[*] 停止并禁用 firewalld..."
systemctl stop firewalld
systemctl disable firewalld

echo "[*] 恢复 iptables 备份: $BK"
iptables-restore < "$BK"
iptables -L -n | head -8
echo "[+] 回滚完成"

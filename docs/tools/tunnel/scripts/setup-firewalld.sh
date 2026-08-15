#!/bin/bash
# ============================================================
# 配置本机 firewalld 隔离策略（按自身 IP 识别角色）
# 用法: ./setup-firewalld.sh         # 直接在目标主机上执行
# 幂等：可重复执行
# 角色:
#   192.168.0.13  访问端: 出站封禁 15（DROP all -> 15）
#   192.168.0.15  服务端: 出站仅放行 14:16610，其余到 14 DROP
#   192.168.0.14  中继:   无出站限制（trusted 全放行）
# ============================================================
set -e

IP=$(ip -4 -o addr show 2>/dev/null | awk '$2=="enp1s0"{print $4}' | cut -d/ -f1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "[*] 本机 IP: $IP"

# 1. 启用 firewalld
systemctl enable --now firewalld 2>/dev/null || systemctl start firewalld

# 2. 入站: 业务网卡放入 trusted 区（全放行，保持既有服务 16610/16620/9999/12345 不受影响）
firewall-cmd --permanent --zone=trusted --change-interface=enp1s0

# 3. 出站隔离 direct 规则（先删后加，保证幂等）
case "$IP" in
  192.168.0.13)
    echo "[*] 角色: 访问端 —— 封禁所有到 15 的出站"
    firewall-cmd --permanent --direct --remove-rule ipv4 filter OUTPUT 0 -d 192.168.0.15 -j DROP 2>/dev/null || true
    firewall-cmd --permanent --direct --add-rule    ipv4 filter OUTPUT 0 -d 192.168.0.15 -j DROP
    ;;
  192.168.0.15)
    echo "[*] 角色: 服务端 —— 出站仅允许新发起连接 14:16610（放行回包）"
    firewall-cmd --permanent --direct --remove-rule ipv4 filter OUTPUT 0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
    firewall-cmd --permanent --direct --remove-rule ipv4 filter OUTPUT 1 -d 192.168.0.14 -p tcp --dport 16610 -j ACCEPT 2>/dev/null || true
    firewall-cmd --permanent --direct --remove-rule ipv4 filter OUTPUT 2 -d 192.168.0.14 -j DROP 2>/dev/null || true
    # 0: 放行回包（否则 14→15 的入站连接回包被丢，导致"14 到不了 15"）
    firewall-cmd --permanent --direct --add-rule    ipv4 filter OUTPUT 0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    # 1: 15 新发起的连接仅允许到 14:16610
    firewall-cmd --permanent --direct --add-rule    ipv4 filter OUTPUT 1 -d 192.168.0.14 -p tcp --dport 16610 -j ACCEPT
    # 2: 其余新连接到 14 一律丢弃
    firewall-cmd --permanent --direct --add-rule    ipv4 filter OUTPUT 2 -d 192.168.0.14 -j DROP
    ;;
  192.168.0.14)
    echo "[*] 角色: 中继 —— 无出站限制"
    ;;
  *)
    echo "[!] 未知 IP: $IP，仅配置 trusted 区，未添加 direct 规则"
    ;;
esac

firewall-cmd --reload
echo "[+] 当前 direct 规则:"
firewall-cmd --direct --get-all-rules
echo "[+] firewalld 配置完成"

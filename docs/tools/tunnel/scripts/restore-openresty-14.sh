#!/bin/bash
# ============================================================
# 恢复 14 的原 openresty 网关（还原"查询服务"，仅在中继节点执行）
# 用法: ./restore-openresty-14.sh   # 在 192.168.0.14 上执行
# 作用: 停止 gost tunnel server -> 重启原 openresty 网关(16610/16620/53)
# ============================================================
set -e
IP=$(ip -4 -o addr show 2>/dev/null | awk '$2=="enp1s0"{print $4}' | cut -d/ -f1)
[ "$IP" = "192.168.0.14" ] || { echo "[!] 本脚本仅适用于 192.168.0.14 (当前: $IP)"; exit 1; }

echo "[*] 停止 gost tunnel server..."
pkill -f "[g]ost -L tunnel" 2>/dev/null || true
sleep 1
ps aux | grep "[g]ost -L" | grep -v grep || echo "  (gost 已停止)"

echo "[*] 重启原 openresty 网关 (prefix: /work/jboss/uapm/uap-edge)..."
su - jboss -c 'cd /work/jboss/uapm/openresty && ./bin/openresty -p /work/jboss/uapm/uap-edge' 2>&1 || \
  su - jboss -c '/work/jboss/uapm/openresty/bin/openresty -p /work/jboss/uapm/uap-edge' 2>&1
sleep 2

echo "[*] 监听端口检查:"
ss -tlnp 2>/dev/null | grep -E ":16610|:16620|:53\b" || echo "  [!] 网关未监听，请检查 /work/jboss/uapm/uap-edge/logs/error.log"
echo "[+] 恢复完成"

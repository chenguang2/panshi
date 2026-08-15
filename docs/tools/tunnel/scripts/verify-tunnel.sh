#!/bin/bash
# ============================================================
# 验证隧道与隔离性（从工作站执行，通过 ssh 检查各节点）
# 用法: ./verify-tunnel.sh [SSH_PASS]
# 依赖: sshpass
# ============================================================
SSH_PASS="${1:-${SSH_PASS:-linux123!@#}}"
SSH="sshpass -p $SSH_PASS ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 -o LogLevel=ERROR"

echo "==================== 1. 端到端访问 ===================="
curl -s -o /dev/null -w "curl http://192.168.0.13:9999/  ->  HTTP %{http_code}  (%{time_total}s)\n" \
  --max-time 8 http://192.168.0.13:9999/
echo

echo "==================== 2. 隔离性: 13 -> 15 必须全阻断 ===================="
$SSH root@192.168.0.13 '
  timeout 3 curl -s -o /dev/null -w "13->15:12345  %{http_code}\n" http://192.168.0.15:12345/ 2>&1 || echo "13->15:12345  BLOCKED ✓"
  timeout 3 curl -s -o /dev/null -w "13->15:12346  %{http_code}\n" http://192.168.0.15:12346/ 2>&1 || echo "13->15:12346  BLOCKED ✓"
  timeout 3 bash -c "echo > /dev/tcp/192.168.0.15/22" 2>/dev/null && echo "13->15:22      OPEN ✗" || echo "13->15:22      BLOCKED ✓"
'
echo

echo "==================== 3. 15 -> 14:16610 隧道连接 ===================="
$SSH root@192.168.0.14 '
  echo "-- established on 14:16610:"
  ss -tn state established | grep 16610 || echo "  (无 established 连接!)"
  echo "-- 14 gost 日志中的双向连接:"
  grep -E "192.168.0.1[35]" /root/gost-14-tunnel.log 2>/dev/null | tail -3
'
echo

echo "==================== 4. 15 端交付 ===================="
$SSH root@192.168.0.15 '
  tail -3 /root/gost-15-tunnel.log 2>/dev/null | grep -oE "\"client\"|\"dst\":\"127.0.0.1:12345\"|\"inputBytes\":[0-9]+|\"outputBytes\":[0-9]+" | tail -6
'
echo
echo "==================== 5. firewalld 状态 ===================="
for h in 13 14 15; do
  echo "-- 192.168.0.$h --"
  $SSH root@192.168.0.$h 'echo "  zone: $(firewall-cmd --get-zone-of-interface=enp1s0 2>/dev/null)  rules: $(firewall-cmd --direct --get-all-rules 2>/dev/null | tr "\n" " ")"'
done

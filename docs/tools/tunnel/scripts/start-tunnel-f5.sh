#!/bin/bash
# ============================================================
# Design A：F5 负载均衡场景（14 = F5 VIP，不能跑任何程序）
# 用法: ./start-tunnel-f5.sh        # 三台服务器各自执行（按 IP 识别角色）
# 角色:
#   14 = F5 模拟：纯 TCP 转发 (VIP 16610 -> 池成员 15:16611)
#   15 = 平台节点（自含）：gost tunnel server (16611) + rtcp client (本地 -> 12345)
#   13 = 访问端：visitor (9999 -> VIP 14:16610)
# 前置:
#   - 网络层已放通 14 -> 15:16611（F5 到池成员的内部转发路径，必须）
#   - /root/gost 存在（v3.2.6 linux/arm64）
# ============================================================
TUNNEL_ID="5a1d5536-362d-4551-bbc9-27d7a76e1e6c"
VIP="192.168.0.14"
MEMBER_PORT=16611
LOG_DIR=/root

IP=$(ip -4 -o addr show 2>/dev/null | awk '$2=="enp1s0"{print $4}' | cut -d/ -f1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')

[ -x /root/gost ] || { echo "[!] /root/gost 不存在或不可执行"; exit 1; }

# 幂等：先停掉本机已有的 gost 进程
pkill -x gost 2>/dev/null || true
sleep 0.5

case "$IP" in
  192.168.0.14)
    echo "[*] 14 = F5 模拟: 纯 TCP 转发 VIP:16610 -> 池成员 192.168.0.15:$MEMBER_PORT"
    cd /root && setsid nohup ./gost -L "tcp://:16610/192.168.0.15:$MEMBER_PORT" > $LOG_DIR/gost-14-f5.log 2>&1 </dev/null &
    ;;
  192.168.0.15)
    echo "[*] 15 = 平台节点(自含): tunnel server :$MEMBER_PORT + rtcp -> 本地 12345"
    cd /root && setsid nohup ./gost -L "tunnel+ws://:$MEMBER_PORT?tunnel.direct=true" > $LOG_DIR/gost-15-server.log 2>&1 </dev/null &
    sleep 0.5
    cd /root && setsid nohup ./gost -L "rtcp://:0/127.0.0.1:12345" -F "tunnel+ws://127.0.0.1:$MEMBER_PORT?tunnel.id=$TUNNEL_ID&ws.keepalive=true" > $LOG_DIR/gost-15-client.log 2>&1 </dev/null &
    ;;
  192.168.0.13)
    echo "[*] 13 = 访问端: visitor :9999 -> F5 VIP $VIP:16610"
    cd /root && setsid nohup ./gost -L "tcp://:9999" -F "tunnel+ws://$VIP:16610?tunnel.id=$TUNNEL_ID&ws.keepalive=true" > $LOG_DIR/gost-13-tunnel.log 2>&1 </dev/null &
    ;;
  *)
    echo "[!] 未知 IP: $IP，无法确定角色"
    exit 1
    ;;
esac

sleep 1.5
echo "[+] gost 进程:"
ps aux | grep "[g]ost -L" | grep -v grep || echo "  (未找到 gost 进程)"
echo "[+] 日志: $LOG_DIR/gost-*.log"

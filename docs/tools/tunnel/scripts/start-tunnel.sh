#!/bin/bash
# ============================================================
# 启动本机 gost 隧道（按自身 IP 识别角色）
# 用法: ./start-tunnel.sh [ws|tcp]
#       默认 ws = WebSocket 承载 (tunnel+ws, 16610 为 HTTP/WS 端点)
#       tcp  = 裸 TCP 承载 (tunnel, 备选方案)
# 前置: /root/gost 存在（v3.2.6 linux/arm64）
# 顺序: 14(中继) -> 15(client) -> 13(visitor)
# ============================================================
MODE="${1:-ws}"
TUNNEL_ID="5a1d5536-362d-4551-bbc9-27d7a76e1e6c"
RELAY="192.168.0.14"
LOG_DIR=/root

case "$MODE" in
  ws)  SCHEME="tunnel+ws"; KEEPALIVE="&ws.keepalive=true" ;;
  tcp) SCHEME="tunnel";    KEEPALIVE="" ;;
  *)   echo "[!] 未知模式: $MODE (可选 ws|tcp)"; exit 1 ;;
esac

IP=$(ip -4 -o addr show 2>/dev/null | awk '$2=="enp1s0"{print $4}' | cut -d/ -f1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')

[ -x /root/gost ] || { echo "[!] /root/gost 不存在或不可执行"; exit 1; }

# 幂等：先停掉本机已有的 gost 隧道进程
pkill -x gost 2>/dev/null || true
sleep 0.5

echo "[*] 承载模式: $MODE ($SCHEME://)"

case "$IP" in
  192.168.0.14)
    echo "[*] 14 中继: tunnel server on :16610"
    cd /root && setsid nohup ./gost -L "$SCHEME://:16610?tunnel.direct=true" > $LOG_DIR/gost-14-tunnel.log 2>&1 </dev/null &
    ;;
  192.168.0.15)
    echo "[*] 15 服务端: rtcp -> 127.0.0.1:12345, 经 $RELAY:16610 隧道"
    cd /root && setsid nohup ./gost -L "rtcp://:0/127.0.0.1:12345" -F "$SCHEME://$RELAY:16610?tunnel.id=$TUNNEL_ID$KEEPALIVE" > $LOG_DIR/gost-15-tunnel.log 2>&1 </dev/null &
    ;;
  192.168.0.13)
    echo "[*] 13 访问端: visitor on :9999, 经 $RELAY:16610 隧道"
    cd /root && setsid nohup ./gost -L "tcp://:9999" -F "$SCHEME://$RELAY:16610?tunnel.id=$TUNNEL_ID$KEEPALIVE" > $LOG_DIR/gost-13-tunnel.log 2>&1 </dev/null &
    ;;
  *)
    echo "[!] 未知 IP: $IP，无法确定角色"
    exit 1
    ;;
esac

sleep 1.5
echo "[+] gost 进程:"
ps aux | grep "[g]ost -L" | grep -v grep || echo "  (未找到 gost 进程)"
echo "[+] 日志: $LOG_DIR/gost-*.tunnel.log"

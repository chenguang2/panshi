#!/bin/bash
# ============================================================
# 停止本机 gost 隧道进程
# 用法: ./stop-tunnel.sh           # 直接在目标主机上执行
# ============================================================
echo "[*] 停止 gost 隧道进程..."
pkill -f "[g]ost -L" 2>/dev/null || true
sleep 1
if ps aux | grep "[g]ost -L" | grep -v grep >/dev/null; then
  echo "[!] 仍有 gost 进程存活:"
  ps aux | grep "[g]ost -L" | grep -v grep
else
  echo "[+] gost 已全部停止"
fi

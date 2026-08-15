#!/bin/bash
# ============================================================
# 一键部署：从工作站向 13/14/15 推送脚本并执行配置 + 启动隧道
# 用法: ./deploy.sh                # 密码可用环境变量 SSH_PASS 覆盖
# 步骤: 推送脚本 -> 配置 firewalld -> 确保 gost 二进制 -> 启动隧道(14→15→13) -> 验证
# ============================================================
set -u
SSH_PASS="${SSH_PASS:-linux123!@#}"
HOSTS="13 14 15"
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
TO=12

sshx() { timeout "$TO" sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=6 -o LogLevel=ERROR "$@"; }
scpx() { timeout "$TO" sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no "$@"; }

echo "==================== 1. 推送脚本到三台服务器 ===================="
for h in $HOSTS; do
  echo "--- 192.168.0.$h ---"
  scpx "$BASE_DIR/setup-firewalld.sh" "$BASE_DIR/start-tunnel.sh" "$BASE_DIR/stop-tunnel.sh" \
       "$BASE_DIR/rollback-firewalld.sh" root@192.168.0.$h:/root/ 2>/dev/null || echo "  [!] scp 失败"
  sshx root@192.168.0.$h 'chmod +x /root/setup-firewalld.sh /root/start-tunnel.sh /root/stop-tunnel.sh /root/rollback-firewalld.sh' 2>/dev/null
done

echo "==================== 2. 确保 gost 二进制存在（14 缺失时从 13 拷贝） ===================="
if ! sshx root@192.168.0.14 'test -x /root/gost' 2>/dev/null; then
  echo "[*] 14 缺少 gost，从 13 拷贝"
  scpx root@192.168.0.13:/root/gost /tmp/opencode/gost.bin 2>/dev/null && \
  scpx /tmp/opencode/gost.bin root@192.168.0.14:/root/gost 2>/dev/null && \
  sshx root@192.168.0.14 'chmod +x /root/gost && /root/gost -V' 2>/dev/null
else
  echo "[+] 14 已有 /root/gost"
fi

echo "==================== 3. 配置 firewalld ===================="
for h in $HOSTS; do
  echo "--- 192.168.0.$h ---"
  sshx root@192.168.0.$h '/root/setup-firewalld.sh' 2>/dev/null | grep -E "^\[\*\]|^\[\+\]|ipv4" || echo "  [!] firewalld 配置输出异常"
done

echo "==================== 4. 启动隧道（14 → 15 → 13） ===================="
sshx root@192.168.0.14 '/root/start-tunnel.sh' 2>/dev/null | grep -E "^\[\*\]|^\[\+\]" || echo "  [!] 14 启动输出异常"
sleep 2
sshx root@192.168.0.15 '/root/start-tunnel.sh' 2>/dev/null | grep -E "^\[\*\]|^\[\+\]" || echo "  [!] 15 启动输出异常"
sleep 1
sshx root@192.168.0.13 '/root/start-tunnel.sh' 2>/dev/null | grep -E "^\[\*\]|^\[\+\]" || echo "  [!] 13 启动输出异常"

echo "==================== 5. 验证 ===================="
"$BASE_DIR/verify-tunnel.sh" "$SSH_PASS"
echo
echo "[+] 部署完成"

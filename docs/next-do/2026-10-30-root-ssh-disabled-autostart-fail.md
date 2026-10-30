# 10.6.98.72 root SSH 被禁导致自启动失败（permitrootlogin no）

> 2026-10-30 · 状态：**未解决（机器侧手工兜底，平台侧改造待立项）**

## 现象

平台「自启动管理」对 10.6.98.72 执行时失败，日志关键行：

```
root@10.6.98.72: Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password).
Permission denied, please try again.
Permission denied, please try again.
root@10.6.98.72: Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password).
```

`Permission denied, please try again.` ×2 = 密码认证**真实发生且被服务器拒绝**（区别于仅密钥失败后回退成功的形态，如 192.168.0.15 那次）。

## 根因（已实锤）

```
sshd -T | grep -i permitrootlogin
→ permitrootlogin no
```

**该机 sshd 完全禁止 root SSH 登录（密码与密钥均拒）**。平台自启动走直连 `root@节点` 通道（写 `/etc/systemd/system/edge.service` + `systemctl enable`），在此类机器上永远失败——与密码对错无关（用户 root 密码验证正确）。

机器画像：ECS 云主机（主机名 `ecs-lksc-lksc-app-k-hy098072`）、LinxOS V6 ARM64、登录横幅 `Authorized only. All activity will be monitored and reported`（安全加固）。运维标准路径 = 普通账号 `rocksware` SSH 登录 → `su - root`（已在 secure 日志证实可行）。

## 立即恢复（手工兜底）

在 72 上 `rocksware` 登录后 `su - root`，粘贴执行平台回显的完整命令（自启动日志「手工执行命令」行，整段 base64）：

```bash
echo <base64 整段> | base64 -d > /etc/systemd/system/edge.service && systemctl daemon-reload && systemctl enable edge && systemctl is-enabled edge
# 成功输出 enabled
```

## 后续选项

| 方案 | 说明 | 状态 |
|---|---|---|
| **B. 平台支持「普通用户 + sudo」通道**（治本） | 节点清单配 rocksware；systemd 操作经 sudo（需 `sudoers.d` 免密）。涉及节点安装/自启动/edge.env 多处 root 直连假设，属功能改造，**需 openspec 立项** | 待立项 |
| C. 运维放开 `PermitRootLogin prohibit-password` + 平台配密钥 | `no` 下不行，至少放宽一级；安全团队可能不允许 | 待运维决策 |
| 手工兜底 | 每次遇到此类机器按上方命令人肉执行 | 当前态 |

**注意**：给 rocksware 加 sudo（`visudo -f /etc/sudoers.d/rocksware`，内容 `rocksware ALL=(ALL) NOPASSWD: ALL`）**不会改变平台行为**——平台当前代码仍直连 root。sudo 只是方案 B 的机器侧前置。

## 排查方法论（可复用）

1. 日志形态区分失败性质：`Permission denied (publickey,...)` 仅密钥失败（会回退密码）；`Permission denied, please try again.` = 密码被服务器拒（收到密码判定错误**或策略拒绝**）
2. 密码"对的"却被拒 → 依次查：**faillock 锁定**（`faillock --user root`）→ **sshd 策略**（`sshd -T | grep permitrootlogin`，用 `-T` 看 Match 合并后的最终值，别翻配置文件猜）→ PAM 层（`/var/log/secure` 找 `User root not allowed` / `ROOT LOGIN REFUSED` / `pam_securetty`）
3. `permitrootlogin no` 的机器：root 密码/密钥全拒，唯一通道 = 普通用户 + su/sudo

## 关联

- 192.168.0.13 磁盘 100% 满（`Failed to create temporary directory`）——同期另一台机器故障，用户自行处理中
- 平台当前自启动实现：`ansible_service` / 自启动管理（EdgeAutostart.vue），root 直连假设遍布节点安装/自启动/edge.env

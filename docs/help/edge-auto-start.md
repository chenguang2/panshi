# Edge 节点开机自启动配置（systemd）

## 背景

Edge 网关节点（部署了 `uap-edge` + `openresty`）默认**不会开机自启**——机器重启后 Edge 服务不会自动拉起，需要人工执行 `bin/edge start`。

本文档说明如何通过 **systemd 服务**将 Edge 配置为开机自启动。已在 `192.168.0.24`（Kylin Linux V10）真机验证通过。

## 前置条件

- 能通过 SSH 以 `root` 登录节点
- 节点操作系统为 systemd 发行版（如 Kylin V10、CentOS 7+、Ubuntu 16+），执行 `systemctl --version` 确认
- 知道以下路径与运行用户（**每台节点可能不同，务必先确认**）：

| 项 | 说明 | 示例值（192.168.0.24） |
|---|---|---|
| Edge 目录 | 含 `bin/edge` 的目录 | `/data/rocks/rockses/3.1/uapm/uap-edge` |
| 运行用户 | Edge 以哪个用户运行 | `rocksware` |

> **确认方法**：执行 `ps aux | grep bin/openresty | grep -v grep`，输出第一列就是运行用户；`ls /proc/<pid>/cwd` 或看命令里的 `-p` 参数即为 Edge 目录。

## 配置步骤

### 1. 创建 systemd 服务文件

SSH 登录节点后，创建 `/etc/systemd/system/edge.service`：

```bash
cat > /etc/systemd/system/edge.service <<'EOF'
[Unit]
Description=Edge Gateway (uap-edge)
After=network.target

[Service]
Type=oneshot
User=rocksware
Group=rocksware
WorkingDirectory=/data/rocks/rockses/3.1/uapm/uap-edge
ExecStart=/data/rocks/rockses/3.1/uapm/uap-edge/bin/edge start
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
```

> **按实际节点修改**：`User`/`Group` 改成该节点的运行用户，`WorkingDirectory`/`ExecStart` 里的路径改成该节点的 Edge 目录。

### 2. 重新加载并启用开机自启

```bash
systemctl daemon-reload
systemctl enable edge
```

`systemctl enable edge` 会在 `/etc/systemd/system/multi-user.target.wants/` 下生成开机自启链接。

### 3. 启动并验证

```bash
# 启动服务（首次立即启动一次）
systemctl start edge

# 查看服务状态
systemctl status edge

# 确认 Edge 进程已拉起（与上一步的用户/路径一致）
ps aux | grep bin/openresty | grep -v grep
```

`systemctl status edge` 应显示 `active (exited)` 且 `status=0/SUCCESS`。

### 4. 验证开机自启（可选，重启机器测试）

```bash
systemctl is-enabled edge   # 输出 enabled 即已配置开机自启
reboot                      # 重启后应自动拉起 Edge
```

## 日常管理命令

| 操作 | 命令 |
|---|---|
| 查看状态 | `systemctl status edge` |
| 手动启动 | `systemctl start edge` |
| 停止 | `systemctl stop edge` |
| 查看日志 | `journalctl -u edge -n 100` |
| 取消开机自启 | `systemctl disable edge` |

## 配置说明

- **`Type=oneshot` + `RemainAfterExit=yes`**：`bin/edge start` 会 daemon 化启动 nginx 后立即返回（不阻塞），用 oneshot + RemainAfterExit 让服务保持 active 状态，便于 `systemctl status` 查看。
- **`User=rocksware`**：Edge 必须以创建它的用户运行（否则 nginx 可能因目录权限/日志权限失败）。不要用 root 运行 Edge。
- **崩溃自动重启**：本配置未开启 `Restart=`。如需 Edge 异常退出时自动重启，可在 `[Service]` 加一行：
  ```ini
  Restart=on-failure
  ```
  > 注意：`bin/edge start` 是 daemon 化的，systemd 的 `Restart` 检测的是 start 命令进程而非 nginx 进程本身，对 nginx 崩溃的感知有限。若要强健的守护，需改用 `Type=simple` + nginx `daemon off` 方式（改动较大，默认不采用）。

## 多节点批量配置提示

若需在多台节点统一配置，可借助磐石 Admin 的 ansible 能力或自行脚本化。每台节点只需按上述"按实际节点修改"调整 `User`/`Group`/路径即可复用同一份服务文件模板。

## 附：正常启动后的状态说明

配置完成后执行 `systemctl status edge`，会看到类似以下输出：

```
Active: active (exited) since Thu 2026-08-20 09:57:36 CST; 19s ago
Process: 854 ExecStart=/data/rocks/rockses/3.1/uapm/uap-edge/bin/edge start (code=exited, status=0/SUCCESS)
```

各字段含义如下：

| 字段 | 含义 | 是否正常 |
|---|---|---|
| `Active: active (exited)` | 服务处于活跃状态，但启动命令已返回 | ✅ 正常 |
| `since ... 19s ago` | 服务启动于该时间，已运行 19 秒 | ✅ 正常 |
| `Process: 854 ExecStart=... (code=exited, status=0/SUCCESS)` | 启动命令 `bin/edge start` 以退出码 0（成功）结束 | ✅ 正常 |

**重点理解：`active (exited)` 不代表服务挂了。**

- 本配置采用 `Type=oneshot` + `RemainAfterExit=yes`。
- `bin/edge start` 会 **daemon 化**启动 nginx 后**立即返回**（不阻塞），所以 systemd 记录到的主进程（`bin/edge start` 命令本身）执行完就退出了。
- `RemainAfterExit=yes` 让 systemd 在命令退出后**仍将服务标记为 active**（而非 failed/inactive），便于 `systemctl status` 查看。

**真正的 nginx 进程是独立运行的，不归 systemd 直接管理。** 因此判断服务是否正常，应确认 nginx 进程存在：

```bash
# 确认 nginx 进程存在且以正确用户运行
ps aux | grep bin/openresty | grep -v grep

# 或确认监听端口（换成该节点实际端口）
ss -tlnp | grep -E '16620|:80 '
```

只要 nginx 进程存在，服务即为正常运行。若看到 `active (failed)` 或 `status=1`（非 0），才是启动失败，可执行 `journalctl -u edge -n 100` 查看日志排查。


## 平台功能：自启动管理

磐石 Admin 已提供"自启动管理"页面（侧边栏"边缘网络"菜单），可在平台上统一对多个 Edge 节点启用/禁用/查询开机自启动，无需逐台 SSH 手动配置。

- **启用/禁用**：下发上述 `edge.service` 并执行 `systemctl enable/disable`。需提供节点的 **root 账号密码**（仅本次操作使用，不保存）。
- **查询状态**：显示 enabled / disabled / not_configured（未配置）三态，复用节点现有连接，无需 root。
- **高级参数**：可覆盖 Edge 目录、运行用户（默认取运行后台程序的用户，请确认为节点 Edge 实际运行用户）。

> 本页的手动 systemd 配置步骤，适用于不通过平台、自行配置节点的场景；平台功能与手动配置效果一致，最终都会在节点生成 `/etc/systemd/system/edge.service` 并 enable。

# Edge 节点开机自启动配置（systemd）

## 背景

Edge 网关节点（部署了 `uap-edge` + `openresty`）默认**不会开机自启**——机器重启后 Edge 服务不会自动拉起，需要人工执行 `bin/edge start`。

本文档说明如何通过 **systemd 服务**将 Edge 配置为开机自启动。已在 `192.168.0.24`（Kylin Linux V10）、`192.168.0.14`（LinxOS V6.0.99 ARM64）真机验证。

> **重要**：`bin/edge start` 本身**不清理**上次异常退出残留的 unix socket 与 pid 文件，而 nginx 只在**正常退出**时才 unlink 监听 socket。因此**断电/强杀之后的下一次开机必然启动失败**（`bind() … (98: Address already in use)`）。下面的服务文件带 `ExecStartPre` 启动自愈步骤，这是自启动能真正生效的前提，**不要省略**。

## 前置条件

- 能通过 SSH 以 `root` 登录节点（写 `/etc/systemd/system/`、`systemctl` 需要 root）
- 节点操作系统为 systemd 发行版（如 Kylin V10、LinxOS、CentOS 7+、Ubuntu 16+），执行 `systemctl --version` 确认
- 知道以下路径与运行用户（**每台节点可能不同，务必先确认**）：

| 项 | 说明 | 示例值（192.168.0.24） |
|---|---|---|
| Edge 目录 | 含 `bin/edge` 的目录 | `/data/rocks/rockses/3.1/uapm/uap-edge` |
| 运行用户 | Edge 以哪个用户运行 | `rocksware` |

> **确认方法**：执行 `ps aux | grep bin/openresty | grep -v grep`，输出第一列就是运行用户；命令里 `-p` 后面的路径即为 Edge 目录。

## 配置步骤

### 1. 创建 systemd 服务文件

SSH 登录节点后，创建 `/etc/systemd/system/edge.service`：

```bash
cat > /etc/systemd/system/edge.service <<'EOF'
[Unit]
Description=Edge Gateway
After=network.target

[Service]
Type=forking
User=rocksware
Group=rocksware
WorkingDirectory=/data/rocks/rockses/3.1/uapm/uap-edge
ExecStartPre=/bin/bash -c 'if pgrep -f "[b]in/openresty -p /data/rocks/rockses/3.1/uapm/uap-edge" >/dev/null 2>&1; then echo "Edge 已在运行，跳过残留清理" 1>&2; exit 1; fi; rm -f /data/rocks/rockses/3.1/uapm/uap-edge/logs/nginx.pid /data/rocks/rockses/3.1/uapm/uap-edge/conf/*.sock /data/rocks/rockses/3.1/uapm/uap-edge/logs/*.sock; echo "已清理 Edge 残留 socket / pid 文件"'
ExecStart=/data/rocks/rockses/3.1/uapm/uap-edge/bin/edge start
ExecStop=-/data/rocks/rockses/3.1/uapm/uap-edge/bin/edge stop
ExecReload=/data/rocks/rockses/3.1/uapm/uap-edge/bin/edge reload
PIDFile=/data/rocks/rockses/3.1/uapm/uap-edge/logs/nginx.pid

[Install]
WantedBy=multi-user.target
EOF
```

> **按实际节点修改**：`User`/`Group` 改成该节点的运行用户，四处路径改成该节点的 Edge 目录（`ExecStartPre` 里的路径出现 3 次，一处都不能漏）。

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

`systemctl status edge` 应显示 `active (running)`（`Type=forking` + `PIDFile` 后 systemd 跟踪 nginx master）。

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
| 重载配置 | `systemctl reload edge` |
| 查看日志 | `journalctl -u edge -n 100` |
| 取消开机自启 | `systemctl disable edge` |

## 配置说明

- **`Type=forking` + `PIDFile`**：`bin/edge start` 会 fork 出 nginx master 后退出。`forking` 让 systemd 按 `PIDFile` 跟踪 nginx master 主进程，`active (running)` 即代表 nginx 真在跑；`systemctl restart` 也能正确先停后起。（已废弃的 `Type=oneshot` + `RemainAfterExit=yes` 会把「命令退出」当成「服务活跃」，nginx 挂了也显示 active，不要回退。）
- **`ExecStartPre` 启动自愈**：清理上次断电/强杀残留的 `conf/*.sock`、`logs/*.sock` 与 `logs/nginx.pid`。判据是「本前缀有没有 `bin/openresty -p <edge_path>` 进程」而不是 pid 文件（pid 文件本身就是残留物）；**有实例在跑时脚本以非零退出码结束**，拒绝起第二个同前缀实例，也绝不删在跑实例的 socket。
- **`ExecStop=-…bin/edge stop`**：`-` 前缀表示忽略退出码，停一个已经停掉的实例视为成功。`bin/edge stop` 自己会 `openresty -s stop` 并清理 socket。
- **`User=` 必须与 Edge 实际运行用户一致**：socket/pid/日志目录都属该用户，用错用户会因权限失败（也不要图省事用 root）。
- **崩溃自动重启**：本配置未开启 `Restart=`。`bin/edge start` 是 daemon 化的，systemd 的 `Restart` 只能感知 `start` 命令本身、对 nginx 崩溃感知有限；且 `Restart` 解决不了残留 socket（每次重试都以同样方式失败）。若要强健的守护，需改用 `Type=simple` + nginx `daemon off`（改动较大，默认不采用）。

## 排障：开机启动失败 `bind() … (98: Address already in use)`

典型现场（节点关机重启后 nginx 没起来）：

```
edge[1937]: nginx: [emerg] bind() to unix:/data/.../uap-edge/conf/edge_events.sock failed (98: Address already in use)
…（重试 5 次）
systemd[1]: edge.service: New main PID 2910714 does not exist or is a zombie.
systemd[1]: edge.service: Failed with result 'protocol'.
```

**根因**：`98` 不等于「别的进程占着」——nginx 只在**正常退出**时 unlink 监听 unix socket，断电/强杀后 socket 文件留在磁盘上，下一次 `bind()` 就撞自己上次留下的 inode；同时残留的 `logs/nginx.pid` 让 systemd 读到早已回收的 PID，报 `protocol` 失败。这也是为什么「手动 `bin/edge stop` 后再 `bin/edge start` 就恢复了」——清理恰好发生在 `stop` 分支。

**处理**：

1. 确认当前 unit 是否带 `ExecStartPre`：`grep ExecStartPre /etc/systemd/system/edge.service`。没有就是老版本 unit（平台在 2026-11-13 之前下发的），按本文档第 1 步覆盖后 `systemctl daemon-reload`。
2. 立即恢复（不必 reboot）：先在平台上点该节点的「启动 Nginx」（脚本已先清理再启动），或手工 `bin/edge stop` 后 `systemctl start edge`。
3. 若 `ps aux | grep bin/openresty` 显示**确有** nginx 在跑而服务仍 failed：说明它不在 systemd 管理下（人工启动过），`systemctl start` 会被启动自愈以「已在运行」拒绝，属预期；执行 `bin/edge stop` 后 `systemctl start edge` 托管过去。
4. 手工排查残留（**先确认没有活实例**再删）：

   ```bash
   ps aux | grep '[b]in/openresty'            # 应无输出
   ls -l <edge_path>/conf/*.sock <edge_path>/logs/*.sock <edge_path>/logs/nginx.pid
   rm -f <edge_path>/logs/nginx.pid <edge_path>/conf/*.sock <edge_path>/logs/*.sock
   ```

## 多节点批量配置提示

若需在多台节点统一配置，可直接使用平台「自启动管理」（见文末），或自行脚本化。每台节点只需按上述「按实际节点修改」调整 `User`/`Group`/路径即可复用同一份服务文件模板。

> **存量节点注意**：`ExecStartPre` 自愈是 2026-11-13 引入的。**升级后需对每台已启用自启动的节点重新执行一次「启用自启动」**，把新 unit 下发下去（平台不会自动重启在跑的网关）。

## 平台功能：自启动管理

磐石 Admin 已提供「自启动管理」页面（侧边栏「边缘网络」菜单），可在平台上统一对多个 Edge 节点启用/禁用/查询开机自启动，无需逐台 SSH 手动配置。

- **启用/禁用**：下发上述 `edge.service` 并执行 `systemctl enable/disable`。需提供节点的 **root 账号密码**（仅本次操作使用，不保存）。
- **查询状态**：显示 enabled / disabled / not_configured（未配置）三态，复用节点现有连接，无需 root。
- **高级参数**：可覆盖 Edge 目录、运行用户（默认取运行后台程序的用户，请确认为节点 Edge 实际运行用户）。

> 本页的手动 systemd 配置步骤，适用于不通过平台、自行配置节点的场景；平台功能与手动配置效果一致，最终都会在节点生成 `/etc/systemd/system/edge.service` 并 enable。平台下发的 unit 与本文档完全一致（含 `ExecStartPre` 自愈）。

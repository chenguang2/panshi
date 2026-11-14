# Design

## 根因证据

### 1. nginx 只在「正常退出」时 unlink 监听 unix socket

`openresty-1.29.2.5edge/bundle/nginx-1.29.2/src/core/ngx_connection.c`（`ngx_close_listening_sockets`）：

```c
if (ls[i].sockaddr->sa_family == AF_UNIX
    && ngx_process <= NGX_PROCESS_MASTER
    && ngx_new_binary == 0
    && (!ls[i].inherited || ngx_getppid() != ngx_parent))
{
    u_char *name = ls[i].addr_text.data + sizeof("unix:") - 1;
    if (ngx_delete_file(name) == NGX_FILE_ERROR) { … }
}
```

只有主进程正常收尾才会 `ngx_delete_file`。断电、`SIGKILL`、OOM-kill 都走不到这里，socket inode 留在磁盘上；`bind()` 对已存在的 socket 路径一律返回 `EADDRINUSE`（98），与「真有人占着」不可区分。`ngx_cycle.c:731` 的 reload 分支同理（重载时删掉不用的 socket）。

### 2. `bin/edge start` 不清理，只有 `stop` 清

节点实测 `/work/jboss/uapm/uap-edge/bin/edge`（WK_VER=1.3.5）：

```bash
case "$WK_CMD" in
  start)  WK_OPT="" ;;      # ← 无清理
  stop)   WK_OPT="-s stop" ;;
esac
…
cd $OR_DIR && bin/openresty -p "$WK_DIR" $WK_OPT && { … }
if [ "$WK_CMD" = "stop" ]; then
  unix_socks=($(grep -E '^[[:space:]]*listen[[:space:]]+unix:[[:space:]]*/' $WK_DIR/conf/*.conf … | awk -F'[:;]' '{print $3}'))
  for _sock in "${unix_socks[@]}"; do [ -e "$_sock" ] && $bin_rm -f "$_sock"; done
fi
```

清理只在 `stop` 分支。开机走 `start` → 无防线。（`docs/edge/user-guide/使用手册.md:228` 也承认该报错：「可以先执行 `bin/edge stop`，再重新启动」——正是把 stop 的清理当补丁用。）

### 3. 平台侧两处让问题更隐蔽

- `build_edge_service_content` 的 `ExecStop=/bin/bash -c "… if [ -n "$PID" ] …"`：systemd 解析 Exec 行时双引号不可嵌套，内层 `"` 处即结束引用，`bash -c` 只收到被截断的脚本（`if [ -n `）→ 语法错误 → **`bin/edge stop` 与它的 socket 清理从未执行过**；原「读 pid 文件兜底 kill」的兜底也因此是死代码。
- `cmd_scripts/nginx_cmd.sh` 的清理路径写成 `$prefix/logs/edge_*.sock`，实测真实 socket 在 `$prefix/conf/`（`conf/edge_events.sock` 等）→ 从未命中。

## 决策

### 决策 1：在 systemd 侧加 `ExecStartPre` 自愈，不改 `bin/edge`

`bin/edge` 是 edge 产品包（`edge-pack`/openresty 安装包）自带的第三方脚本，平台无法保证升级后仍在（`pack-rebase` 会换 pack）。systemd unit 是平台 `enable` 时下发的自有工件，是唯一稳定且**每次启动必经**的挂点。

清理范围：`logs/nginx.pid`（否则 systemd 读到死 PID，报 `result 'protocol'` /「New main PID … does not exist」）、`conf/*.sock`、`logs/*.sock`（不同版本 socket 目录不同；`使用手册` 的 `unix:logs/edge_stream_monitor.sock` 形态也要覆盖）。

### 决策 2：判据是「本前缀 openresty 进程」，不是 pid 文件

- pid 文件恰是残留物本身（旧 PID 早已回收），用它做判据会在最需要清理时失效；
- PID 可能被复用（开机早期 PID 小、数量少，理论上可撞），用 pid 文件 + `kill -0` 会误判「在跑」并跳过清理 → 自愈失效；
- 权威判据是命令行：`pgrep -f "[b]in/openresty -p <edge_path>"`。模式里的 `[b]` 让正则要求连续的 `bin/openresty`，从而**不匹配执行该脚本的 `bash -c` 自身**（其命令行里是字面量 `[b]in/openresty`）。
- 命中时**显式 `exit 1`**：拒绝同前缀起第二个实例（它必然 bind 失败），且绝不删在跑实例的 socket（unlink 会让该实例所有**新**连接失败，静默劣化）。

### 决策 3：`ExecStop` 用 `-<edge>/bin/edge stop`，不加 `Restart=`

- 去掉 `bash -c "…"` 嵌套引号，命令回到纯 systemd 语法；`-` 前缀让「停一个已停实例」幂等成功（否则 `systemctl stop` 会因 `openresty -s stop` 失败被标 failed）；
- 原兜底 kill 冗余：ExecStop 结束后 systemd 仍按 `KillMode=control-group` 向 cgroup 发 SIGTERM（nginx master 正常收尾并 unlink socket），超时再 SIGKILL。`bin/edge stop` 自己也会清 socket。
- 不加 `Restart=on-failure`：它不能解决残留（每次重试都以同样方式 bind 失败），却会在真故障时制造重试噪声；决策沿用 2026-08 autostart 的 1a/6a 结论（守护 nginx 需 `daemon off`，属独立变更）。

### 决策 4：`ExecStartPre` 脚本必须 systemd 安全

约束（`tests/test_edge_service_stale_socket.py` 钉死）：

| 约束 | 原因 |
|---|---|
| 不出现 `$` | systemd 对 Exec 行做环境变量展开（`$VAR` 作为独立单词时替换），脚本自身的 shell 变量会被提前吞掉 |
| 不出现 `%` | systemd 说明符展开（`%i` 等），路径或输出里带 `%` 直接变形 |
| 不出现单引号 | 整个脚本用 `'…'` 包裹（单引号同时抑制 systemd 的变量展开），内层再出现会截断 |
| `bash -n` 可解析 | 单测里真跑 `bash -n -c`，防止转义拼错只在真机炸 |

### 决策 5：`nginx_cmd.sh` 同步修正（平台「启动 Nginx」入口）

开机自愈只解决 systemd 路径；平台上「启动 Nginx」按钮走 `nginx_cmd.sh`，同样会撞残留。抽 `clean_stale_sockets()` 并在 `nginx_start` **最前面**调用（顺序有测试钉住：启动命令执行时残留必须已清），`nginx_stop` 复用同一函数（顺带修掉 `logs/` 错误路径）。

## 验证

真机（192.168.0.14，LinxOS V6.0.99 ARM64，jboss 非 root，与 systemd `User=` 同权限）：

| 用例 | 命令 | 结果 |
|---|---|---|
| 在跑实例守卫 | 真实路径脚本（edge 正在跑） | `Edge 已在运行，跳过残留清理`，rc=1，3 个 socket 与 pid 文件原样保留 |
| 残留清理 | scratch 前缀 + 3 个 sock + 死 PID 2910714 | rc=0，`已清理 Edge 残留 socket / pid 文件`，目录内文件全清 |
| 启动前清理顺序 | `nginx_cmd.sh nginx_start <scratch-prefix>`（stub `bin/edge` 检测启动瞬间是否还有 sock） | `Cleaned up stale socket file: …/conf/edge_events.sock` → marker=`STALE_CLEAN`，`conf/` 空 |

`pgrep` 在该发行版存在（`/usr/bin/pgrep`），`conf/` 与 `logs/` 均归运行用户所有 → 非 root 即可清理。

## 风险与边界

- 若某版本把 `-p` 写成相对路径启动 nginx，`pgrep -f … -p <abs>` 不命中 → 会误删其 socket（新连接失效，存量不受影响）。`bin/edge` 恒传绝对路径 `-p "$WK_DIR"`，实测三节点均如此。
- `execstartpre` 在 `User=` 身份下运行：socket/pid 都可删（目录属主即运行用户）；若历史上有 root 手工起过 edge，配置文件属主变化会导致清理失败，此时 nginx 仍会报原错——需人工修属主，属预期。
- 存量节点需重新「启用自启动」一次才会拿到新 unit（旧 unit 无 `ExecStartPre`）；本次不改 enable 的编排（不自动 start/restart，避免对在跑的网关做无预期抖动）。

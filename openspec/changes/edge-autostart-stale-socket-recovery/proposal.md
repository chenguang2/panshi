# Proposal

## Why

节点配置了开机自启动（`edge.service`）后，**机器关机重启，Edge 的 nginx 起不来**。2026-11-13 生产节点（ecs-lksc-…）实测：

```
edge[1937]: nginx: [emerg] bind() to unix:/data/rocks/uapm/3.1/uap-edge/conf/edge_events.sock failed (98: Address already in use)
… (5 次重试)
systemd[1]: edge.service: New main PID 2910714 does not exist or is a zombie.
systemd[1]: edge.service: Failed with result 'protocol'.
```

根因（两层）：

1. **nginx 只在正常退出时 unlink 监听 unix socket**（`ngx_close_listening_sockets` 要求 `ngx_process <= NGX_PROCESS_MASTER && ngx_new_binary == 0`；`ngx_cycle.c` 的 reload 分支同理）。机器断电/强杀后 `conf/edge_events.sock`、`conf/edge_stream_events.sock`、`conf/edge_stream_monitor.sock` 与 `logs/nginx.pid` 全部留在磁盘上，下一次 `bind()` 必报 `98: Address already in use`（EADDRINUSE，与「有别的进程占着」表现相同）。
2. **产品脚本 `bin/edge start` 不做残留清理**——它的清理只写在 `stop` 分支（`bin/edge` 里 `grep 'listen unix:' conf/*.conf` + `rm`，仅在 `WK_CMD=stop` 后执行）。开机走的是 `start`，等于没有任何防线。

平台侧另有一处缺陷放大了排查难度：`edge.service` 的 `ExecStop` 写成
`/bin/bash -c "… if [ -n "$PID" ] …"`，**双引号嵌套**被 systemd 在内层第一个 `"` 处截断，该命令从未真正执行过（`bin/edge stop` 与其 socket 清理都没跑）；而 `cmd_scripts/nginx_cmd.sh` 的残留清理路径写成 `$prefix/logs/edge_*.sock`，真实 socket 在 `conf/`，等于从未命中。

## What Changes

- **`edge.service` 增加启动自愈 `ExecStartPre`**（`build_edge_service_content`）：启动前判断本前缀 `bin/openresty -p <edge_path>` 是否在跑——在跑则显式失败（拒绝第二个实例，且绝不删在跑实例的 socket），否则删除 `logs/nginx.pid` 与 `conf/*.sock`、`logs/*.sock` 后继续启动。脚本体内不得出现 `$`/`%`/单引号（systemd 会做变量与说明符展开、外层用单引号包裹）。
- **`ExecStop` 简化为 `-<edge_path>/bin/edge stop`**：抹掉嵌套引号；`-` 前缀忽略退出码（停一个已停实例应幂等成功）。`bin/edge stop` 自带 socket 清理；ExecStop 失败时 systemd 仍向 cgroup 发 SIGTERM，原「读 pid 文件兜底 kill」是死代码且冗余。
- **`cmd_scripts/nginx_cmd.sh` 修正**：新增共享 `clean_stale_sockets`（清理 `conf/` 与 `logs/` 两处的 `*.sock` + pid 文件，有活实例时跳过），`nginx_start` **先清理再启动**，`nginx_stop` 复用同一函数。
- **不做**：不改 `bin/edge`（第三方产品脚本，随 edge 包发布）；不加 `Restart=`（见 design 决策 3）；不删 `/etc/systemd/system/edge.service`（disable 语义不变）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `edge-node-autostart`：新增「服务文件启动自愈（残留 socket / pid 清理）」需求——`enable` 下发的 unit SHALL 在 `ExecStart` 前自愈断电/强杀残留，且不得误伤在跑实例；停止 SHALL 幂等。

## Impact

- 后端：`app/services/ansible_service.py`（`build_edge_service_content` + 新增 `_edge_service_prestart_script`）、`ansible/cmd_scripts/nginx_cmd.sh`
- 测试：新增 `backend/tests/test_edge_service_stale_socket.py`（10 用例：脚本 systemd 安全性、真机可执行的清理/守卫行为、ExecStop 形态、nginx_cmd.sh 启动前清理顺序）；`tests/test_ansible_service.py::TestBuildEdgeServiceContent` 断言反转（`kill -TERM` → `-…/bin/edge stop`）
- 文档：`docs/help/edge-auto-start.md`（unit 样例改为现行 Type=forking 版 + 新增「开机启动失败：Address already in use」排障节）
- 存量节点：需重新执行一次「启用自启动」以落地新 `edge.service`（老 unit 无自愈步骤）；当前已挂的节点可直接用「启动 Nginx」恢复（脚本已修）

# Tasks

## 批 1：后端 unit 生成器 + 平台启动脚本（核心修复）

- [x] 1.1 TDD RED：新增 `backend/tests/test_edge_service_stale_socket.py`（10 用例）——`ExecStartPre` 存在性 / 脚本无 `$`·`%`·单引号 / `bash -n` 可解析 / 真跑清理残留 sock+pid / 在跑实例守卫不误删（stub openresty 进程）/ 死 PID 复用不阻断清理 / `ExecStop` 形态与无嵌套引号 / `nginx_cmd.sh` 启动前清理顺序与 `conf/`+`logs/` 双路径；RED 实测 10 failed
- [x] 1.2 `ansible_service.py` 新增 `_edge_service_prestart_script(edge_path)`：`pgrep -f "[b]in/openresty -p <edge_path>"` 守卫（在跑 → `exit 1`）→ 删 pid 文件与 `conf/*.sock`、`logs/*.sock`
- [x] 1.3 `build_edge_service_content` 插入 `ExecStartPre=/bin/bash -c '<script>'`；`ExecStop` 由「`bash -c "…"$PID"…"` 嵌套引号」改为 `-<edge_path>/bin/edge stop`（幂等 + 去掉死代码兜底）
- [x] 1.4 `ansible/cmd_scripts/nginx_cmd.sh`：新增 `clean_stale_sockets()`（`conf/` + `logs/` 双路径、活实例跳过、顺带删 pid 文件），`nginx_start` 首行调用，`nginx_stop` 复用（替换原只清 `logs/` 的失效块）
- [x] 1.5 GREEN：新文件 10 passed；断言反转同步 `tests/test_ansible_service.py::TestBuildEdgeServiceContent`（`kill -TERM` → `-…/bin/edge stop`）
- [x] 1.6 同域回归：`pytest tests/test_ansible_service.py tests/test_edge_autostart.py tests/test_edge_service_stale_socket.py tests/test_node_batch_action.py tests/test_node_health.py -q` → 127 passed

## 批 2：真机验证（非 root，与 systemd `User=` 同权限）

- [x] 2.1 在跑实例守卫（真实路径 `/work/jboss/uapm/uap-edge`）：`Edge 已在运行，跳过残留清理` rc=1，3 个 socket + pid 文件原样保留
- [x] 2.2 残留清理（scratch 前缀 + 3 sock + 死 PID）：rc=0，文件全清（`find` 只剩空目录）
- [x] 2.3 `nginx_cmd.sh nginx_start`（scratch 前缀 + stub `bin/edge` 检测启动瞬间残留）：先打印清理行，启动瞬间 marker=`STALE_CLEAN`，`conf/` 空
- [x] 2.4 环境前提核对：`/usr/bin/pgrep` 存在；`conf/`、`logs/` 属主为运行用户（非 root 可清理）

## 批 3：文档与收口

- [x] 3.1 `docs/help/edge-auto-start.md`：unit 样例改为现行 `Type=forking` + `ExecStartPre` + `PIDFile` 版（原样例是已废弃的 oneshot）；新增「开机启动失败：`bind() … Address already in use`」排障节（根因 + 自愈机制 + 存量节点处理）
- [x] 3.2 后端全量 pytest + PG 方言冒烟（本次不改 schema/写库路径，按 #103 判定不触发；如全量顺带跑过即记绿）
- [ ] 3.3 存量节点落地：对生产节点重新执行一次「启用自启动」（下发新 unit）→ 重启节点验证 nginx 自动拉起；当前已 failed 的节点先用「启动 Nginx」恢复

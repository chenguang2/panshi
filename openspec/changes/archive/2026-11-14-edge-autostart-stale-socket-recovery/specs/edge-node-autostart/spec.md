## ADDED Requirements

### Requirement: 服务文件启动自愈

平台 `enable` 自启动时下发的 `edge.service` SHALL 在 `ExecStart` 之前自愈上次异常退出（断电 / SIGKILL / OOM）残留的监听 unix socket 与 pid 文件，使节点重启后 Edge 能自动拉起而不依赖人工 `bin/edge stop`。自愈步骤 MUST NOT 触碰任何在跑实例的 socket；停止流程 SHALL 幂等。

#### Scenario: 启动前清理断电残留

- **GIVEN** 节点上次是异常退出（断电 / 强杀），`<edge_path>/conf/*.sock`、`<edge_path>/logs/*.sock` 与 `<edge_path>/logs/nginx.pid` 残留在磁盘上，且该 Edge 前缀没有任何 openresty 进程在跑
- **WHEN** 开机执行 `systemctl start edge`
- **THEN** 服务 SHALL 先删除上述残留 socket 与 pid 文件，再执行 `<edge_path>/bin/edge start`
- **AND** 启动 SHALL NOT 出现 `bind() to unix:…sock failed (98: Address already in use)`
- **AND** `systemctl status edge` SHALL NOT 出现 `Failed with result 'protocol'`（死 PID 已不再被 PIDFile 读到）

#### Scenario: 在跑实例不被误伤

- **GIVEN** 该 Edge 前缀已有 `bin/openresty -p <edge_path>` 进程在运行（例如人工启动过）
- **WHEN** 执行 `systemctl start edge`
- **THEN** 自愈步骤 SHALL 跳过清理并使启动显式失败（附「已在运行」原因），MUST NOT 删除该实例的 socket 或 pid 文件（否则其实例新连接将全部失败）

#### Scenario: 停止幂等

- **WHEN** 对已停止的 `edge.service` 执行 `systemctl stop edge`
- **THEN** 停止 SHALL 以成功结束（服务文件通过 `-` 前缀忽略 `bin/edge stop` 在无实例时的非零退出码）

#### Scenario: Exec 行符合 systemd 语法

- **WHEN** 生成 `edge.service`
- **THEN** 每条 `Exec*` 行 SHALL 为 systemd 可解析的单一语法（MUST NOT 出现 `bash -c "…"$VAR"…"` 这类嵌套双引号，systemd 会在内层引号处截断命令）
- **AND** 内联 shell 脚本 SHALL NOT 含 `$`、`%` 与单引号（避免 systemd 变量/说明符展开与外层单引号截断），并 SHALL 可被 `bash -n` 解析

### Requirement: 平台「启动 Nginx」先清理残留

平台节点操作中的「启动 Nginx」（`cmd_scripts/nginx_cmd.sh` 的 `nginx_start`）SHALL 在调用启动命令前清理 `<prefix>/conf` 与 `<prefix>/logs` 两处的残留 `*.sock` 与 pid 文件；存在活实例时 SHALL 跳过清理。清理路径 MUST 覆盖 `conf/`（真实 socket 所在），不得只清 `logs/`。

#### Scenario: 启动命令执行时残留已清

- **WHEN** 节点存在残留 `conf/edge_events.sock` 且无 openresty 进程，用户点击「启动 Nginx」
- **THEN** 脚本 SHALL 先删除残留 socket/pid，再执行 `<prefix>/bin/edge start`（启动命令观察到目录内已无 `*.sock`）
- **AND** 执行输出 SHALL 列出被清理的文件路径

#### Scenario: 活实例跳过清理

- **WHEN** pid 文件对应的进程存活且确为 nginx 进程
- **THEN** 启动 SHALL 报告「已在运行」并跳过清理，MUST NOT 删除其 socket

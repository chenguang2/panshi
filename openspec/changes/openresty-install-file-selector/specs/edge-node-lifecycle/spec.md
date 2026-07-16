## MODIFIED Requirements

### Requirement: Single node start
The system SHALL support starting the PANSHI/Edge process on a single node via `POST /clusters/{cluster_id}/nodes/{node_id}/start`. The system SHALL use ansible-runner to execute playbook `edge.yml` with tag `nginx_cmd_run` and extravar `nginx_cmd: nginx_start`. The ansible `script` module SHALL copy `cmd_scripts/nginx_cmd.sh` to the remote host and execute it with arguments `nginx_start`, `prefix`, `port`.

#### Scenario: Successful start
- **WHEN** user sends `POST /clusters/1/nodes/5/start`
- **AND** node 5 has `edge_path="/data/qcg/uapm/uap-edge"` and `ip="192.168.100.235"`
- **THEN** the system SHALL call `ansible_runner.run(private_data_dir="backend/ansible/", playbook="edge.yml", tags="nginx_cmd_run", extravars={"ips": "192.168.100.235", "nginx_cmd": "nginx_start", "prefix": "/data/qcg/uapm/uap-edge", "ports": "<port>"})`
- **AND** on the remote host, `nginx_cmd.sh` SHALL detect `prefix` ending with `uap-edge` and run `$prefix/bin/edge start`
- **THEN** the system SHALL return `{"status": "ok", "message": "节点已启动", "rc": 0}`

#### Scenario: Start edge 1.0 (non-uap-edge prefix)
- **WHEN** user sends `POST /clusters/1/nodes/5/start`
- **AND** node 5 has `edge_path="/work/jboss/openresty-14"` (not ending with `uap-edge`)
- **THEN** on the remote host, `nginx_cmd.sh` SHALL run `$prefix/nginx/sbin/nginx`

#### Scenario: Node not found
- **WHEN** user sends `POST /clusters/1/nodes/999/start`
- **AND** node 999 does not exist in cluster 1
- **THEN** the system SHALL return HTTP 404 with `{"detail": "节点不存在"}`

#### Scenario: Start with node not in ansible inventory
- **WHEN** user sends `POST /clusters/1/nodes/5/start`
- **AND** node IP is not present in `backend/ansible/inventory/hosts`
- **THEN** ansible-runner SHALL return unreachable host error
- **THEN** the system SHALL return HTTP 502 with `{"detail": "节点不在 Ansible inventory 中或无法连接"}`

#### Scenario: Start when ansible-runner times out
- **WHEN** user sends `POST /clusters/1/nodes/5/start`
- **AND** ansible-runner exceeds job_timeout (60s)
- **THEN** the system SHALL return HTTP 504 with `{"detail": "节点启动超时"}`

### Requirement: Install OpenResty with file selection
系统 SHALL 支持用户在安装 OpenResty 时选择安装包版本。`install_openresty.yml` 中的文件名 SHALL 使用 `{{ openresty_file }}` 变量替代。`InstallOpenrestyRequest` SHALL 包含 `openresty_file` 必填字段，`srcpath` 和 `destpath` 由后端自动计算。

所有 openresty tar 包 SHALL 保持相同的内部目录结构——解压后须包含 `install-edge/` 子目录及 `install-edge.sh`。

#### Scenario: 选择版本并安装
- **WHEN** 用户选择 `openresty-edge-26071515.tar.gz` 并开始安装
- **AND** 前端发送 `POST /clusters/1/nodes/5/install-openresty`
- **AND** 请求体包含 `openresty_file: "openresty-edge-26071515.tar.gz"` 和 `prefix`
- **THEN** 后端 SHALL 从 `PRIVATE_DATA_DIR` 构建 `srcpath`，从 `prefix` 推出 `destpath`
- **AND** 后端 SHALL 将 `openresty_file` 注入 ansible extravars
- **AND** Ansible SHALL 使用 `openresty-edge-26071515.tar.gz` 进行传输和解压

#### Scenario: 未传 openresty_file
- **WHEN** API 请求未包含 `openresty_file` 字段
- **THEN** 后端 SHALL 返回 422 验证错误
- **AND** 提示"请选择 OpenResty 安装包"

### Requirement: Single node stop
The system SHALL support stopping the process via `POST /clusters/{cluster_id}/nodes/{node_id}/stop`. Tag: `nginx_cmd_run`, extravar: `nginx_cmd: nginx_stop`.

#### Scenario: Successful stop
- **WHEN** user sends `POST /clusters/1/nodes/5/stop`
- **THEN** the system SHALL call `ansible_runner.run(..., tags="nginx_cmd_run", extravars={"ips": "...", "nginx_cmd": "nginx_stop", "prefix": "...", "ports": "..."})`
- **AND** on the remote host, `nginx_cmd.sh` SHALL run `$prefix/bin/edge stop` (edge 2.5) or `$prefix/nginx/sbin/nginx -s stop` (edge 1.0)
- **THEN** the system SHALL return `{"status": "ok", "message": "节点已停止", "rc": 0}`

#### Scenario: Stop already stopped node
- **WHEN** user sends `POST /clusters/1/nodes/5/stop`
- **AND** the process is already not running
- **THEN** the system SHALL still return success (idempotent)

### Requirement: Single node restart (reload)
The system SHALL support reloading the process configuration via `POST /clusters/{cluster_id}/nodes/{node_id}/restart`. Tag: `nginx_cmd_run`, extravar: `nginx_cmd: nginx_reload`.

#### Scenario: Successful reload
- **WHEN** user sends `POST /clusters/1/nodes/5/restart`
- **THEN** the system SHALL call `ansible_runner.run(..., tags="nginx_cmd_run", extravars={"ips": "...", "nginx_cmd": "nginx_reload", "prefix": "...", "ports": "..."})`
- **AND** on the remote host, `nginx_cmd.sh` SHALL run `$prefix/bin/edge reload` (edge 2.5) or `$prefix/nginx/sbin/nginx -s reload` (edge 1.0)
- **THEN** the system SHALL return `{"status": "ok", "message": "节点已重启", "rc": 0}`

### Requirement: Single node process check
The system SHALL support checking whether the PANSHI/Edge process is running via `POST /clusters/{cluster_id}/nodes/{node_id}/check`. Tag: `nginx_cmd_run`, extravar: `nginx_cmd: nginx_check`.

#### Scenario: Successful check
- **WHEN** user sends `POST /clusters/1/nodes/5/check`
- **THEN** the system SHALL call `ansible_runner.run(..., tags="nginx_cmd_run", extravars={"ips": "...", "nginx_cmd": "nginx_check", "prefix": "...", "ports": "..."})`
- **AND** `nginx_cmd.sh` SHALL output the process status (PID or "does not exist")
- **THEN** the system SHALL update `Node.status_detail` with the process status
- **THEN** the system SHALL return the process status in the response

### Requirement: Batch node action
The system SHALL provide `POST /clusters/{cluster_id}/nodes/action` for batch operations. Request body: `{"action": "start"|"stop"|"restart"|"check"|"statistic", "node_ids": [int]}`.

#### Scenario: Batch start multiple nodes
- **WHEN** user sends `POST /clusters/1/nodes/action` with body `{"action": "start", "node_ids": [1, 2, 3]}`
- **THEN** the system SHALL execute ansible-runner for each node independently
- **AND** total concurrent executions SHALL NOT exceed the concurrency limit (5)
- **AND** the response SHALL contain per-node results with individual status

#### Scenario: Batch action with empty node_ids
- **WHEN** user sends `POST /clusters/1/nodes/action` with body `{"action": "restart", "node_ids": []}`
- **THEN** the system SHALL operate on all active nodes (status=1) in the cluster

#### Scenario: Batch action with non-existent node
- **WHEN** user sends `POST /clusters/1/nodes/action` with body `{"action": "stop", "node_ids": [1, 999]}`
- **AND** node 999 does not exist
- **THEN** the system SHALL process node 1 and include error for node 999

### Requirement: Node statistic collection
The system SHALL support collecting CPU, memory, disk usage and edge version via `POST /clusters/{cluster_id}/nodes/{node_id}/statistic`. Tag: `edge_statistic`.

#### Scenario: Successful statistic collection
- **WHEN** user sends `POST /clusters/1/nodes/5/statistic`
- **THEN** the system SHALL call `ansible_runner.run(..., tags="edge_statistic", extravars={"ips": "...", "prefix": "...", "ports": "..."})`
- **AND** on the remote host, `cron_check.sh` SHALL:
  - Check nginx process status via PID file
  - Query `http://127.0.0.1:{port}/edge/server_info` for edge version
  - Calculate CPU/memory usage via `ps`
- **THEN** the system SHALL parse `stdout_lines` from ansible-runner result
- **THEN** the system SHALL update `Node.status_detail.statistic` with parsed data
- **THEN** the system SHALL return the statistic data

### Requirement: Generic ansible tag execution
The system SHALL provide `POST /clusters/{cluster_id}/nodes/{node_id}/ansible-run` for executing any allowed ansible tag.

#### Scenario: Execute allowed tag
- **WHEN** user sends `POST /clusters/1/nodes/5/ansible-run` with body `{"tag": "edge_statistic", "extravars": {"prefix": "...", "ports": "..."}}`
- **THEN** the system SHALL execute the specified tag with provided extravars (plus `ips` injected automatically)

#### Scenario: Execute disallowed tag
- **WHEN** user sends `POST /clusters/1/nodes/5/ansible-run` with body `{"tag": "edge_build", ...}`
- **AND** `edge_build` is not in the allowed tags list
- **THEN** the system SHALL return HTTP 400 with `{"detail": "不允许的操作: edge_build"}`

### Requirement: Concurrency limit
The system SHALL enforce `asyncio.Semaphore(5)` for concurrent ansible-runner executions.

#### Scenario: Exceed concurrency limit
- **WHEN** 6 concurrent requests are sent
- **THEN** 5 SHALL execute immediately, the 6th SHALL wait
- **AND** no request SHALL fail due to concurrency overflow

### Requirement: Execution result persistence
The system SHALL persist each ansible-runner execution result in `Node.status_detail` (JSON).

#### Scenario: successful execution
- **WHEN** a start operation completes with `rc=0`
- **THEN** `Node.status_detail` SHALL be updated with `last_execution`, `last_status: "successful"`, `last_rc: 0`, `last_tag: "nginx_cmd_run"`

#### Scenario: failed execution
- **WHEN** a start operation fails (SSH connection refused)
- **THEN** `Node.status_detail` SHALL be updated with `last_status: "failed"`, `last_rc: non-zero`, `last_error: "message"`

### Requirement: Node status query
The system SHALL return last known status including ansible execution results.

#### Scenario: Query node status
- **WHEN** user sends `GET /clusters/1/nodes/5/status`
- **THEN** the response SHALL include `status`, `status_detail`, and derived `last_heartbeat`

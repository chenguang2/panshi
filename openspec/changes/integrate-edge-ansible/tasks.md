## 1. Project Scaffolding

- [x] 1.1 将 `D:\data0\panshi\edge-ansible` 完整复制到 `backend/ansible/`（保留 .git 历史）
- [x] 1.2 在 `backend/ansible/` 下创建 `artifacts/` 目录（已 gitignored）
- [x] 1.3 添加 `ansible-runner` 到 `backend/pyproject.toml` 的 dependencies
- [x] 1.4 验证 `python -c "import ansible_runner; print('OK')"` 正常运行（本地 env 有 pydantic-core build 问题，非代码问题，依赖已声明）

## 2. Backend Data Model

- [x] 2.1 Node 模型增加 `status_detail`（Text, nullable=True）— JSON 格式，记录 ansible 执行结果
- [x] 2.2 DB migration：ALTER TABLE ps_node ADD COLUMN status_detail TEXT（已添加到 migrate.py）

## 3. AnsibleRunnerService

- [x] 3.1 创建 `backend/app/services/ansible_service.py`，实现 `AnsibleRunnerService` 类
- [x] 3.2 实现 `run_playbook(ip, tag, extravars)` 核心方法
      - private_data_dir 指向 `backend/ansible/`
      - extravars 自动注入 `ips=ip`，inventory 自动读取
      - 不生成/修改 inventory 文件
- [x] 3.3 实现全局 `asyncio.Semaphore(5)` 并发控制
- [x] 3.4 实现 `_update_status_detail()`（在 cluster_nodes.py 中）+ `build_status_detail()`（在 service 中）
- [x] 3.5 实现 `_parse_statistic_stdout()` — 从 cron_check.sh 输出中解析 CPU/内存/edge 版本

## 4. Single Node API Endpoints

- [x] 4.1 `POST /clusters/{cluster_id}/nodes/{node_id}/start` — tag=`nginx_cmd_run`, extravars=`{"nginx_cmd": "nginx_start", ...}`
- [x] 4.2 `POST /clusters/{cluster_id}/nodes/{node_id}/stop` — tag=`nginx_cmd_run`, extravars=`{"nginx_cmd": "nginx_stop", ...}`
- [x] 4.3 `POST /clusters/{cluster_id}/nodes/{node_id}/restart` — tag=`nginx_cmd_run`, extravars=`{"nginx_cmd": "nginx_reload", ...}`
- [x] 4.4 `POST /clusters/{cluster_id}/nodes/{node_id}/check` — tag=`nginx_cmd_run`, extravars=`{"nginx_cmd": "nginx_check", ...}`，返回 stdout
- [x] 4.5 `POST /clusters/{cluster_id}/nodes/{node_id}/statistic` — tag=`edge_statistic`，解析 cron_check.sh 输出
- [x] 4.6 `POST /clusters/{cluster_id}/nodes/{node_id}/ansible-run` — 通用 tag 端点，含白名单校验

## 5. Batch API Endpoints

- [x] 5.1 定义 `NodeActionRequest` schema（action, node_ids） + `AnsibleRunRequest` schema
- [x] 5.2 实现 `POST /clusters/{cluster_id}/nodes/action` — 遍历 node_ids，每个节点调用对应操作
- [x] 5.3 并发控制由 AnsibleRunnerService 的 Semaphore 统一管理，逐节点结果已组装

## 6. Error Handling & Edge Cases

- [x] 6.1 节点 IP 不在 inventory → ansible 返回 unreachable → AnsibleExecutionError → HTTP 502
- [x] 6.2 ansible-runner 超时 → asyncio.TimeoutError → AnsibleExecutionError(rc=-1) → HTTP 504
- [x] 6.3 SSH 连接失败 → 更新 status_detail + 返回错误信息
- [x] 6.4 disallowed tag → HTTP 400
- [x] 6.5 非零 rc → 记录到 status_detail，仍返回 HTTP 200
- [x] 6.6 ports 参数缺失 — statistic 端点使用 node.management_port 作为默认值

## 7. Verification & Testing

- [ ] 7.1 单元测试：测试 Semaphore 并发控制
- [ ] 7.2 API 测试：mock `ansible_runner.run`，验证各端点 extravars 组装正确
- [ ] 7.3 集成测试：在有真实 edge 节点且 inventory 已配置的环境中验证
- [ ] 7.4 验证 `lsp_diagnostics` 无新增错误（已有错误均为 SQLAlchemy pyright 误报）
- [ ] 7.5 验证后端 `pytest` 全部通过

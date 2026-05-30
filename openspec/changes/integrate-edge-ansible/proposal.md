## Why

磐石Admin 的节点管理页面已有"启动"/"停止"按钮和对应的 REST API 端点（`POST /clusters/{id}/nodes/{node_id}/start`、`POST /clusters/{id}/nodes/{node_id}/stop`），但这些端点目前是空壳——只返回成功消息而不执行任何实际操作。与此同时，运维团队已经维护了一套成熟的 Ansible 项目（`edge-ansible`），通过 tag + playbook + shell 脚本的方式驱动 edge 节点的完整生命周期。

为了让控制面真正具备远程管理 edge 节点进程的能力，需要将现有 ansible 项目集成到磐石Admin 中，通过 `ansible-runner` Python SDK 在 FastAPI 后端中程序化地调用 playbook。

## What Changes

- 将现有 `D:\data0\panshi\edge-ansible` 目录整体迁入本项目 `backend/ansible/` 下
- 新增 `AnsibleRunnerService` 后端服务层，封装 `ansible-runner` SDK 调用
- SSH 凭据**不存入数据库**，复用现有 `inventory/hosts`（由运维专人管理，密码周期性变更或已配置免密）
- playbook 运行时通过 `extravars={"ips": "..."}` 指定目标节点（playbook 已支持 `{{ ips | default('edge_cluster') }}` 模式），不生成临时 inventory
- 补全 `POST /clusters/{id}/nodes/{node_id}/start`、`/stop`、`/restart`（对应 `nginx_cmd=nginx_start|nginx_stop|nginx_reload`）
- 新增 `POST /clusters/{id}/nodes/{node_id}/check` 端点（对应 `nginx_cmd=nginx_check`）
- 新增 `POST /clusters/{id}/nodes/{node_id}/statistic` 端点（对应 tag `edge_statistic`，返回 CPU/内存/磁盘/edge 版本）
- 新增 `POST /clusters/{id}/nodes/action` 统一批量操作端点
- 新增 `POST /clusters/{id}/nodes/{node_id}/ansible-run` 通用 tag 调用端点
- 在 `Node` 表中增加 `status_detail` 字段（JSON），记录最近一次 ansible 执行结果
- Node 列表接口扩充返回字段：`status_detail`、`last_heartbeat`（从 `status_detail` 中解析）

## Capabilities

### New Capabilities
- `edge-node-lifecycle`: 通过 ansible-runner 远程管理 edge 节点的启动、停止、重启、状态检查、统计采集

### Modified Capabilities
<!-- 无 spec 级别的行为变更 -->

## Impact

| 方面 | 影响 |
|------|------|
| 后端依赖 | `pyproject.toml` 新增 `ansible-runner` 依赖 |
| 后端代码 | 新增 `backend/app/services/ansible_service.py`；修改 `backend/app/api/v1/cluster_nodes.py` |
| 数据模型 | `Node` 表新增 `status_detail`（JSON）字段，**不加** SSH 凭据字段 |
| 项目文件 | 新增 `backend/ansible/` 目录（迁入 edge-ansible，含 `inventory/hosts`、`roles/`、`cmd_scripts/` 等）|
| DB migration | 仅 `status_detail` 字段，nullable，向下兼容 |
| 前端 | 节点详情页需展示 `status_detail` 中的信息（运行状态、最后心跳、统计） |
| 运维 | `inventory/hosts` 由运维单独在其原始仓库维护，本项目只读引用 |

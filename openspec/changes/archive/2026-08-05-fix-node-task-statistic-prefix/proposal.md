## Why

节点任务（Node Task Center）中创建"状态查询"（statistic）等运维类任务时，生成的 ansible 命令 `prefix` 错误地使用了节点的 openresty 安装路径（`node.edge_install_path`），而非 edge 程序前缀（`node.edge_path`）。这导致 `nginx_cmd.sh`/`cron_check.sh` 定位到错误的程序目录，状态查询/启停操作无法作用于实际运行的 edge 程序。

根因：后端执行器 `_execute_node` 对所有任务类型统一按 `params.prefix or edge_install_path or edge_path` 回退，而单节点端点（`cluster_nodes.py`）对运维类操作（start/stop/reload/check/statistic）一律使用 `node.edge_path`。spec 中"params 缺省取节点记录值（如 prefix 取 edge_install_path）"的表述不精确，误导了实现。

## What Changes

- `NodeTaskService._execute_node` 的 prefix 回退逻辑改为按任务类型区分：
  - 运维类（start/stop/reload/check/statistic）：缺省取 `node.edge_path`（edge 程序前缀），与单节点端点一致
  - 安装类（install_openresty/install_edge/associate_new_openresty/edge_pack_add）：缺省取 `node.edge_install_path`（openresty 安装路径），保持现状
- 修正 `_execute_node` 中不准确的 docstring
- 新增回归测试：statistic 任务无 prefix 参数时回退到 `node.edge_path`

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 明确运维类任务（start/stop/reload/check/statistic）的 prefix 缺省取 `node.edge_path`（edge 程序前缀），与单节点端点一致；安装类任务仍取 `node.edge_install_path`。修正原"prefix 缺省统一取 edge_install_path"的不精确表述。

## Impact

- `backend/app/services/node_task_service.py`：`_execute_node` prefix 回退逻辑
- `backend/tests/test_node_task_executor.py`：新增回归测试
- `openspec/specs/node-task-center/spec.md`：delta spec 更新需求表述
- 不影响 API 形状、数据库结构、前端代码

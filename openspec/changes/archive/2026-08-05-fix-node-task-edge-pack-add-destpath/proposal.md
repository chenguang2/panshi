## Why

节点任务中心（NodeTaskCenter）的"升级 Edge(传包)"（edge_pack_add）任务与统一管理（单节点操作）端点生成的 ansible 命令不一致：任务中心的 `destpath` 基于 `node.edge_path` 的父目录，而统一管理端点基于 `node.edge_install_path`（prefix）的父目录。当节点的 edge_path 与 edge_install_path 不在同一父目录时，两个入口会把 pack 包复制到不同目录，导致行为漂移。

## What Changes

- `NodeTaskService._execute_node` 的 edge_pack_add 分支：`destpath` 改为基于 `prefix`（缺省为 `node.edge_install_path`）的父目录，与统一管理端点 `cluster_install.py:499` 一致
- 新增回归测试：edge_path 与 edge_install_path 不同父目录时，destpath 取 prefix 的父目录

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 明确 edge_pack_add 任务的 destpath 语义——取 prefix（缺省 `node.edge_install_path`）的父目录，与统一管理端点一致。

## Impact

- `backend/app/services/node_task_service.py`：edge_pack_add 分支 destpath 计算
- `backend/tests/test_node_task_executor.py`：新增回归测试
- `openspec/specs/node-task-center/spec.md`：delta spec 更新
- 不影响 API 形状、数据库结构、前端代码

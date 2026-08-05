## 1. 回归测试（TDD RED）

- [x] 1.1 在 `backend/tests/test_node_task_executor.py` 新增 `test_statistic_falls_back_to_edge_path_not_install_path`：节点同时设置 edge_path 与 edge_install_path，statistic 任务不传 prefix，断言 `ansible.statistic` 收到 `node.edge_path`
- [x] 1.2 运行新测试确认 RED（当前实际收到 edge_install_path）

## 2. 修复实现（GREEN）

- [x] 2.1 修改 `backend/app/services/node_task_service.py` 的 `_execute_node`：运维类任务（start/stop/reload/check/statistic）prefix 缺省取 `node.edge_path`，安装类任务保持 `node.edge_install_path` 优先
- [x] 2.2 修正 `_execute_node` docstring 中错误的 prefix 语义描述

## 3. 验证

- [x] 3.1 运行新测试确认 GREEN
- [x] 3.2 运行 `tests/test_node_task_executor.py` 全量通过（含既有安装类用例，确认未破坏）
- [x] 3.3 运行后端全量 pytest，确认无新增失败（既有失败与本次改动无关，已核实）

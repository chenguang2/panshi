## 1. 回归测试（TDD RED）

- [x] 1.1 在 `backend/tests/test_node_task_executor.py` 新增 `test_edge_pack_add_uses_install_path_parent_for_destpath`：edge_path 与 edge_install_path 不同父目录，断言 destpath 取 prefix（edge_install_path）父目录
- [x] 1.2 运行新测试确认 RED（当前 destpath 用 edge_target 父目录）

## 2. 修复实现（GREEN）

- [x] 2.1 修改 `backend/app/services/node_task_service.py` edge_pack_add 分支：`destpath` 改为 `str(Path(prefix).parent) + "/"`，与统一管理 `cluster_install.py:499` 一致

## 3. 验证

- [x] 3.1 运行新测试确认 GREEN
- [x] 3.2 运行 `tests/test_node_task_executor.py` 全量通过
- [x] 3.3 运行后端全量 pytest，确认无新增失败（72 个既有失败与本次改动无关，已核实）

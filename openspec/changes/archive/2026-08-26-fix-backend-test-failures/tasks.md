# Tasks: fix-backend-test-failures

> 基线：2026-08-21 实测 37 failed / 1150 passed / 55 skipped。目标：0 failed。

## 1. 取证（阻塞后续所有节）

- [x] 1.1 建 `evidence/` 目录；逐簇跑 `uv run pytest tests/<file> --tb=long -q` 抓完整 traceback，存 evidence/A-cert.md、B-cmdexec.md、C-nodetask.md、D-listapi.md
- [x] 1.2 记录环境事实：`which openssl && openssl version`、Python/pytest 版本、数据库初始化方式，追加进各 evidence 文件
- [x] 1.3 对每簇写初步归类（代码缺陷/测试过时/环境依赖倾向 + 依据），标注置信度

## 2. A 簇：证书/OpenSSL（11 个）

- [x] 2.1 验证/证伪「本机 openssl 缺失」假设；确认 TestDetectOpenssl 的 mock 是否失效（patch 路径漂移）
- [x] 2.2 按 D2 三分法处置 test_cert_generator.py 3 例并记录结论
- [x] 2.3 按 D2 三分法处置 test_ssl_reserved_sni.py 8 例（SAN/SNI 内容断言 vs 证书生成实现）并记录结论
- [x] 2.4 重跑两文件确认全绿（或 skip 带理由）

## 3. B 簇：命令执行脚本（9 个）

- [x] 3.1 对照黑白名单实现与用例期望，定位判定分歧点（放行规则演进 vs 断言过时）
- [x] 3.2 处置超时/退出码上报 2 例与 base64 传输 1 例
- [x] 3.3 重跑 test_cmd_exec_script.py 确认全绿

## 4. C 簇：节点任务 API（2 个）

- [x] 4.1 确认与 B 簇是否同源（cmd 参数 schema）；同源则随 B 簇一并修复
- [x] 4.2 处置 test_create_task_endpoint 与 test_create_cmd_exec_task_accepts_cmd_params
- [x] 4.3 重跑 test_node_task_api.py 确认全绿

## 5. D 簇：列表 API 查询行为（15 个）

- [x] 5.1 对比分页/排序/搜索/过滤的现行响应结构与用例断言，产出差异清单（envelope 字段名、排序键、过滤参数语义）
- [x] 5.2 判定差异属「API 演进未同步测试」还是「查询实现回归」；前者更新断言，后者修查询代码
- [x] 5.3 处置 test_route_api.py 5 例
- [x] 5.4 处置 test_route_list_api.py 7 例
- [x] 5.5 处置 test_upstream_list_api.py 3 例
- [x] 5.6 重跑三文件确认全绿

## 6. 全量回归与收尾

- [x] 6.1 `uv run pytest --tb=short -q` 全量跑：目标 0 failed；skip 数与豁免清单一致
- [x] 6.2 在本文件底部追加「根因结论汇总表」（簇 × 根因 × 处置方式 × 涉及提交）
- [x] 6.3 如有 skip 豁免，更新勘误区列明触发条件与复审计划

---

### 根因结论汇总表（6.2）

| 簇 | 失败数 | 根因 | D2 归类 | 处置方式 | 涉及文件 |
|---|---|---|---|---|---|
| A 证书/OpenSSL | 11 | `detect_openssl()` 仅查 bundled Tongsuo，不回退系统 PATH | 代码缺陷 | 扩展 3 级回退（bundled → PATH → 显式常见路径） | `app/services/cert_generator.py`, `tests/test_cert_generator.py`, `tests/test_ssl_reserved_sni.py` |
| B 命令执行脚本 | 9 | `cmd_exec.sh` 用 GNU `timeout`，macOS 无此命令 | 环境依赖 → 代码修复 | 加 `run_timeout_bash()` 兜底（bash 后台监控 + kill，超时返回 124） | `backend/ansible/cmd_scripts/cmd_exec.sh`, `tests/test_cmd_exec_script.py` |
| C 节点任务 API | 2 | 测试固定装置缺节点数据 → 业务层 404 | 测试过时 | 补全 `test_node_task_api.py`：override get_db + `_seed_nodes()` | `tests/test_node_task_api.py` |
| D 列表 API 查询 | 26* | 1) 旧数据缺 `edge_uuid` 列 → Pydantic v2 验证失败<br>2) `group_filter_ungrouped` 断言写死 `cluster_id=30` | 代码缺陷 / 测试过时 | 1) `route_to_response`/`upstreams.list` 兜底生成 `edge_uuid`<br>2) 断言改为检查 `cluster_group_name` 为空 | `app/api/v1/cluster_routes.py`, `app/api/v1/upstreams.py`, `tests/test_route_api.py`, `tests/test_route_list_api.py`, `tests/test_upstream_list_api.py` |
| 迁移外键报错 | — | `replace` 模式仅 `DELETE` 行不 `DROP TABLE`，旧 schema 残留导致 `sys_user` 缺 `id` 列 | 代码缺陷 | `replace` 模式先 `drop_all` 再 `create_all` | `app/services/db_migration_service.py` |

*注：D 簇原基线 15 失败，实际含 Route/Upstream 共 26 例，均已修复。

### 勘误/豁免清单（6.3）

- 无 skip 豁免。所有 37 个原失败用例均通过代码修复或测试补全变绿。

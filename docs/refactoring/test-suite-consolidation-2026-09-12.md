# 测试套件治理审计（2026-09-12）

> 背景：全量测试运行时间过长（>5.5 分钟，且曾观测到 15 分钟仍卡 73%）、经常失败。
> 本文档为数据驱动的审计结论与分批整改方案。执行遵循 TDD 与逐批验收。

## 1. 现状基线

| 项 | 值 |
|---|---|
| 后端测试文件 | 104 个 |
| 后端用例总数 | 1567（passed 1554 / failed 2 / error 1 / skipped 11） |
| 全量运行时长 | **5:32**（带 --timeout=90 护栏；无护栏时**永久挂死**，实测 15min+ 卡 73%） |
| 前端 | 90 个单测文件 + 32 个 E2E spec（本次未测量，非痛点） |

## 2. 耗时解剖：三大热点占 ~190s（57%）

| 热点 | 耗时 | 机制（已实证） |
|---|---|---|
| `test_script_upload.py` 单个 teardown | **89.7s**（顶满护栏） | `AuthedTestClient(app)` 退出 → lifespan shutdown → `get_node_task_service().shutdown_sync()` join 后台线程不退出（py-spy 实证主线程死等 portal join）；伴随 aiosqlite 连接未归还 SAWarning |
| `test_edge_client_api.py` 20 个用例 | **~100s**（每个固定 5.02s） | `edge_client.py` httpx `timeout=5.0` 未 mock，用例走真实网络超时；目标 IP 来自真实库节点（192.168.0.x），**若节点可达会变成真实请求 Edge，存在安全隐患** |
| 其余 1500+ 用例 | ~142s | 正常水平 |

## 3. "经常失败"根因清单

1. **挂死**：无 per-test timeout。test_script_upload teardown 无限等（复现 2/2 次）。
2. **断言漂移**：`test_audit_operations_api.py` 2 例失败——API 时间序列化改为 ISO+`Z` 后缀，测试仍断言旧格式（`'2025-01-10T03:00:00Z' != '2025-01-10T03:00:00'`）。
3. **环境漂移（结构性，最大隐患）**：**45/104 文件**经 `from app.main import app` / `AuthedTestClient(app)` 触发 lifespan → `init_db()` 连接 `db_config.json` active 指向的**真实库**。后果：
   - 随 active 连接切换集体漂移（历史上 active 曾被切到 manual-demo.db）；
   - 与运行中的开发服务争 SQLite WAL 锁（互为"database is locked"来源）；
   - `test_ansible_inventory_api.py` 更是**直接读写真实库**（`AsyncSessionLocal` 插删 Node、读删除保护基线）。
4. **未 mock 网络 IO**：见热点 2。

## 4. 零价值 / 重复用例清单

### 4.1 零价值（建议直接删除，~14 个）
- `test_function_exists` ×7（test_cert_generator.py）——`assert callable(fn)`，import 成功已证明存在
- `test_endpoint_exists` ×4（test_cluster_install.py）——同上
- `test_update_route_method_exists` 等 ×3（test_route_publish.py）——同上

### 4.2 跨文件重复（用户点名"路由生成很多无效测试"的实证）
| 重复组 | 文件 A | 文件 B | 说明 |
|---|---|---|---|
| route vars 空/null 往返 | test_route_api.py ×3 | test_route_switch_toggle.py ×5 | 同一 API 行为两处共 8 用例 |
| advanced_match 开关 | test_route_advanced.py ×3 | test_advanced_match_enabled.py ×6 | 同一开关行为两处共 9 用例 |
| batch-delete 四连拷 | test_node/route/stream_proxy/upstream_batch_delete.py | — | 共享 helper 已单实现，测试却 4 份同构（~26 用例），可收敛为"共享语义 1 份 + 各资源 1 条烟囱" |
| websocket 单字段 | test_route.py(14) + test_route_api.py(2) | — | 一个 boolean 字段 16 个用例 |
| convert_route_to_edge_format 单字段变体 | test_route_publish.py ×11 | — | 每字段一函数，应合并为 1 个参数化测试 |

### 4.3 合并手段
- **参数化**：全仓仅 1/104 文件使用 `@pytest.mark.parametrize`。同函数内多字段变体（convert_route、summary 结构、qps/bandwidth/error_rate 四兄弟类等）合并后可去重 60-80 个用例。
- 同名测试跨文件：25 组（如 `test_delete_db_only_success` 在 4 个 batch_delete 文件中同名同构）。

## 5. 分批整改方案

| 批次 | 内容 | 预期收益 | 风险 |
|---|---|---|---|
| **P0 提速护栏** | ① pyproject `addopts = ["--timeout=90"]`；② test_edge_client_api mock edge httpx；③ 修 test_script_upload 夹具连接泄漏（dispose engine） | 5:32 → **~1:40**，不再挂死 | 低（不改任何断言） |
| **P1 修失效** | audit_operations 2 断言补 `Z` | 消除 2 failed | 极低 |
| **P2 删零价值+合并重复** | §4.1 全删；§4.2 逐组合并（每组合并前后跑全量对照） | 用例 -60~80，维护面显著缩小 | 中（需逐组合并逐组验证） |
| **P3 结构治理（专项）** | conftest 提供 app 级 fixture：lifespan 前替换 engine 指向内存库，45 文件逐步迁移 | 消除环境漂移与真实库争锁；CI 化前提 | 高（工程量大，建议单开变更） |
| **P4 独立 bug** | node-task retry/cancel 端点 500：audit 钩子会话（A）与 service 会话（B）在 SQLite 上互持写锁 → `database is locked`。建议单独排查修复 | 恢复任务重试功能 | 单独变更 |

## 6. 验收口径

- 每批完成后：`cd backend && uv run pytest -q --durations=20` 全绿 + 时长记录到本文档附录。
- P2 每合并一组：合并前后用例数、覆盖行为清单对照，防止行为覆盖净损失。

## 7. 执行结果（2026-09-12 当日完成）

| 批次 | 状态 | 说明 |
|------|------|------|
| P0a timeout 护栏 | ✅ | pyproject `timeout = 90` |
| P0b edge_client mock | ✅ | `_no_edge_http` autouse 夹具（mock `EdgeClient._request`/`raw_put`），21 用例 105s → 2.2s |
| P0c script_upload 隔离 | ✅ | `isolated_app_lifespan()`（api_helpers 落地，P3 迁移地基），39 用例 90s 挂死 → 9.6s，不再触真实库 |
| P1 修失效断言 | ✅ | audit_operations 3 处补 `Z`（oldest×2 + newest 预防性） |
| P4 retry 自锁修复 | ✅ | 根因：audit 骨架在 get_db 会话 flush 后持写锁，service 第二会话被阻 → busy_timeout 500。修复 `retry_task(task_id, node_ids, db=db)` 贯穿请求会话；守卫测试 `TestRetrySessionThreading`（文件库双引擎复现自锁）；线上重试任务 10 返回 200 |
| P2 删零价值 | ✅ | -10：cert_generator `test_function_exists`×7 + route_publish `TestEdgeClientRouteMethods`×3（hasattr 型）。cluster_install 的 `test_endpoint_exists`×4 实为错误路径断言，**保留** |
| P2 路由重复合并 | ✅ | vars 组：switch_toggle 5→并入 route_api `TestRouteVarsLifecycle` 2；advanced_match 组：6→并入 route_advanced `TestAdvancedMatchToggleDirections` 1；convert 单字段变体 12 个函数→1 个参数化（12 用例，-180 行） |
| P2 batch-delete 四连拷 | ⏸ 决策不合并 | 四文件实为**各自端点处理器的集成测试**（不同 handler/schema/资源细节），跨资源抽象 ROI 为负，详见 §4.2 |
| P2 websocket 16 用例 | ⏸ 暂缓 | schema/import/diff/DB/API 分属不同层，合并收益有限，挂 P3 迁移时顺带复核 |
| P3 立项 | ✅ | `openspec/changes/test-suite-db-isolation/`（proposal/design/tasks） |

### 最终验收数据

```
治理前:  5:32（1567 用例，2 failed + 1 error + 11 skipped，无护栏时永久挂死）
治理后:  2:08（1550 用例，0 failed，1539 passed + 11 skipped[PG opt-in]）
```

- 用例数 1567 → 1550（净 -17：删 10 零价值 + 合并去重 11，新增守卫 4：TestRetrySessionThreading、TestRouteVarsLifecycle×2、TestAdvancedMatchToggleDirections）
- 时长 -64%，挂死清零，真实库/真实网络依赖从测试热路径移除（45 文件结构迁移另立项推进）
- 经验沉淀：AGENTS.md 关键约定 #29（get_db 会话贯穿）、#30（测试治理基线）

## 附录：实测记录

- 2026-09-12 首测：5:32，2F/1E/11S（`--timeout=90 --durations=40`）
- 挂死复现：`pytest -q`（无护栏）两次卡 73%（test_script_upload teardown），15min 未恢复，py-spy 定位 `test_script_upload.py:54` join portal。
- 2026-09-12 P3 DB 隔离迁移完成：1558 passed，1 failed（pre-existing `test_route_list_api` plugin_filter），11 skipped，19 warnings，**3:09**（`uv run pytest -q --timeout=90`）。
  - 全部 45 个 `AuthedTestClient(app)` / `TestClient(app)` 用法均加 `isolated_app_lifespan()` 保护
  - conftest 新增 `isolated_app`、`async_isolated_client`、`async_authed_client`、`unauthenticated_app` fixtures
  - `test_db` fixture 保留（纯 ORM 测试仍需要）
  - 验证: `grep -i "database is locked\|sqlite"` 零输出；所有裸 `TestClient(app)` 均有 lifespan 保护

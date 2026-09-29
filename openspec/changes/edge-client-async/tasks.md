# Tasks: edge-client-async

## 1. 守卫测试先行（RED）

- [x] 1.1 新增 `backend/tests/test_async_offloading_guard.py`：正则抽函数体断言 `publish_to_nodes`/`delete_on_nodes`/`publish_static_resource`/`_generate_local`/`export_archive`/`import_archive`/clusters 删除流含 `await asyncio.to_thread(...)` 调用形态；断言 `api/v1/edge_client.py` 含 `EdgeClient(` 构造的 async 端点同时经 `run_edge_sync` 执行且无裸 `client.` 直调（模式参照 `test_publish_response.py`）
- [x] 1.2 运行守卫测试验证 RED：扫出全部现存裸调点并确认失败原因与 design.md 盘点清单一致（9 failed；裸调清单 = design 枚举的 29 个端点：upstream×5、route×5、global_rule×4、plugin_config×4、plugin_metadata×4、ssl×3、reload×1、stream_route×3）

## 2. edge_sync 编排卸载（GREEN 第一步）

- [x] 2.1 `edge_sync.py::publish_to_nodes`(:386-408) 按两跳形态卸载（design 决策 2 方案 B）：构造 + `mark_route` + `_encrypt` 留事件循环；`publish_fn` → `await asyncio.to_thread(...)`（hop1）→ 循环内 `log_fn` → `post_publish_fn` 非空时 `await asyncio.to_thread(...)`（hop2）→ 循环内 post_log_fn；既有双计数/log_fn 两次调用 quirk 原样保留；线程闭包内不得触碰请求级 db 会话（加代码注释）
- [x] 2.2 `edge_sync.py::delete_on_nodes`(:313-350)：构造留事件循环，`edge_delete_fn` 单跳 `await asyncio.to_thread(edge_delete_fn, client, edge_uuid)`；异常透传路径不变
- [x] 2.3 跑 `pytest tests/test_edge_sync_relay_route.py tests/test_publish_response.py -q` 确认 route/relay_via 标注与响应结构零变化；守卫测试对应断言转绿（16 passed，含守卫 TestEdgeSyncOrchestrationOffloading 2 项；实施中修正守卫抽取正则以兼容 `) -> 返回注解:` 签名收尾）

## 3. 同型腿卸载（GREEN 第二步）

- [x] 3.1 `cluster_static_resources.py::publish_static_resource`(:478-487)：逐节点 `client.raw_put(path, zip_data)` 包 `asyncio.to_thread`；守卫转绿
- [x] 3.2 `cluster_ssl.py`：`_generate_local`(:532/:544) 两次生成调用与 `_apply_cert_chain` 钩子的 `detect_openssl`/`get_cert_expiry`(:375-377) 包 `asyncio.to_thread`；守卫转绿（连带 :615 `_generate_client_dual_certs`——同为 generate_dual_certificates 的 7 次串行子进程，同型阻塞一并卸载）
- [x] 3.3 `database.py`：`export_archive`(:609)/`import_archive`(:635) service 调用包 `asyncio.to_thread`；守卫转绿
- [x] 3.4 `clusters.py` 集群删除流(:291-312)：构造留事件循环，「整个 per-node 删除批次」（七类资源循环 + errs 聚合）闭包为局部函数整体进 `asyncio.to_thread`（对照 :417 既有范例）；守卫转绿
- [x] 3.5 跑 `pytest -k "static or ssl or archive or cluster" -q` 确认相关域回归零红（467 passed / 5 skipped；守卫 TestSameShapedLegsOffloading 5 项转绿，test_publish_response 保持绿）

## 4. edge-client 路由端点统一（GREEN 第三步）

- [x] 4.1 `api/v1/edge_client.py`：~20 个裸调端点迁移至既有 `run_edge_sync`（upstream/route/global_rule/plugin_config/plugin_metadata/ssl/reload_plugins/stream_route 各组 get/create/update/patch/delete）；迁移时逐端点核对所包方法的 httpx timeout < `run_edge_sync` timeout（design 决策 3 超时不变量，当前全部 `_request` 系 5s ✓）（实测迁移 29 个裸调端点：upstream×5、route×5、global_rule×4、plugin_config×4、plugin_metadata×4、ssl×3、reload×1、stream_route×3；全部走 `_request` 5s < wait_for 10s，零 raw_put/raw_delete）
- [x] 4.2 跑 `pytest tests/test_edge_client_api.py tests/test_edge_client_relay_route.py -q` 确认 8 个列表端点之外的端点行为零变化；守卫测试全量转绿（53 passed，含守卫 9 项全绿）

## 5. 全量验证与收尾

- [x] 5.1 全量 `cd backend && uv run pytest`（会话级隔离库，默认 SQLite）确认零回归；确认 `test_publish_response.py` 守卫未误伤（1916 passed / 12 skipped / 0 failed / 4:09，publish_response 4 项各门均绿；warnings summary 中的 PytestUnhandledThreadExceptionWarning 全部来自 test_script_upload.py 的 aiosqlite worker（约定 #42 已知问题），与本变更 to_thread 无关）
- [x] 5.2 按约定 #31 评估：本变更无 schema/写库路径改动，PG 方言冒烟非强制；可选跑 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q` 复核（2026-09-29 已跑：**7 passed**，database.py 触及后保险复核）
- [x] 5.3 真机链路抽查（复用运行中实例，不启停服务）：执行方式为**归档导出探针**（2026-09-29 实测：远程 PG 源导出 17.7s 期间并发健康检查 10 次全部 1.7–2.8ms / HTTP 200，同一 `asyncio.to_thread` 卸载机制）。真实多节点发布会对上海局/南昌局真实 Edge 推配置，未自主触发；publish 路径另有 test_edge_sync_relay_route / test_publish_response 回归覆盖。本变更零 UI 改动，#51 页面验收不适用
- [x] 5.4 更新 `docs/refactoring/code-review-report-2026-09-28.md` H1 行状态（⏸ → ✅，标注本变更名）

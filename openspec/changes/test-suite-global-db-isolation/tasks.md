# Tasks: 测试套件全局库隔离（脱离真实活动库，防 PG 事故）

## 1. 全局重定向落地（conftest）

- [x] 1.1 导入期捕获真实对象（`AsyncSessionLocal` / `_async_engine` / `create_sync_engine`）并建立会话级临时 SQLite 文件引擎（`NullPool` + `PRAGMA foreign_keys=ON`）
- [x] 1.2 `_pin_test_engine()`：把 `app.core.database` 的 `_async_engine` / `AsyncSessionLocal` / `create_sync_engine` / `_active_async_engine` / `_reload_active_engine` 全部钉到隔离库（`_reload_active_engine` 置 no-op，防止切库类逻辑把引擎指回真实配置）
- [x] 1.3 `_sweep_stale_engine_refs()`：按对象身份遍历 `sys.modules`，替换按值导入绑定的陈旧引用（覆盖 `app.main`、`app.api.v1.database` 及函数体内延迟导入）
- [x] 1.4 会话级 autouse 夹具 `_isolated_real_db_redirect`：建表 + 最小种子（`admin(id=1)` + `Cluster(1..3)`）→ yield → dispose + 删除临时目录
- [x] 1.5 既有夹具（`test_db` / `isolated_app` / `async_isolated_client` / `unauthenticated_app` / `isolated_session`）行为契约不变

## 2. 残余用例自足化

- [x] 2.1 新增夹具 `real_create_sync_engine`（取回被重定向替换的真实实现），修正 `test_database.py::TestEngineBuilders::test_sync_engine_points_at_active_sqlite`
- [x] 2.2 `test_route_list_api.py::test_list_routes_plugin_filter_reduces_count` 改为自给自足种子（种入带 `proxy_rewrite` 的路由 + 一条不带），消除长期既有失败（原记录见 AGENTS #100）

## 3. 验证

- [x] 3.1 单文件对照：`test_ansible_inventory_api.py`（原 28 failed）→ **29 passed / 8.25s**
- [x] 3.2 全量对照：`uv run pytest -q` 从 **102 failed / 1507 passed** → **1615 passed / 12 skipped / 0 failed / 188s**
- [x] 3.3 真实库零写入取证：运行后查询真实 PG 的 `sys_audit_log`，最新条目仍是改造前的冒烟/用户操作，测试未产生任何新记录
- [x] 3.4 临时库无残留：运行后 `ls /tmp/panshi-test-db-*` 为空
- [x] 3.5 应用侧未受影响：后端 dev 实例健康检查正常，接口行为不变（仅测试代码改动）

## 4. 文档与立项同步

- [x] 4.1 `AGENTS.md` #30：删除"切 PG 后禁止跑全量 pytest"的临时禁令，改为"全局隔离已强制 + 全量可跑（1615 passed）"
- [x] 4.2 新建 openspec 变更 `test-suite-global-db-isolation`（proposal / design / tasks / spec delta）
- [x] 4.3 关系说明：本变更**取代**归档变更 `2026-09-12-test-suite-db-isolation` 的 "Per-File Migration" 路线（详见 design D1）

## Why

活动库于 2026-09-17 从 SQLite 切换到 PostgreSQL 后，后端测试套件的"直连真实库"隐患从技术债升级为**安全事故**：

- **量级证据**：全量 `uv run pytest` → 102 failed / 1507 passed。71 次失败发生在登录请求，异常为 `asyncpg.InterfaceError: another operation is in progress` —— 测试跨事件循环复用 asyncpg 连接，PG 严格连接语义直接拒绝（SQLite 时代被弱类型与串行容忍掩盖）。
- **安全风险**：23 个测试文件直接构造 `TestClient(app)` / `httpx.AsyncClient(ASGITransport(app=app))` 而未使用隔离夹具，请求打到 `db_config.json` 的 active 连接（即真实 PG 库）。测试一旦进入写路径，就会污染真实数据。本次取证（审计日志 `sys_audit_log`）确认失败集中在 setup 阶段、未造成污染，但风险敞口真实存在。
- **既有方案未闭合**：归档变更 `2026-09-12-test-suite-db-isolation` 完成了夹具建设（`isolated_app` / `async_isolated_client`）与部分文件迁移，但其 "Per-File Migration" 路线要求逐文件改造，执行到一半停摆（`AGENTS.md` #30 记录仍有 45 个文件绑定真实库），且新写测试会持续回退。
- **连带故障**：`AGENTS.md` #30 被迫写下"切 PG 后禁止跑全量 pytest"，等于放弃了唯一能发现全局回归的信号源。

## What Changes

- **单点全局重定向**（`backend/tests/conftest.py`，导入期执行）：把 `app.core.database` 的 `_async_engine` / `AsyncSessionLocal` / `create_sync_engine` / `_active_async_engine` / `_reload_active_engine` 全部钉到**会话级临时 SQLite 文件**（`/tmp/panshi-test-db-*/isolated.db`）。此后任何测试（含未迁移文件、含应用 lifespan 的 `init_db`）都不再触碰真实活动库。
- **陈旧引用清扫**：按对象身份遍历 `sys.modules`，替换 `from app.core.database import AsyncSessionLocal` 这类**按值导入**在导入时刻绑定的真实对象（`app.main`、`app.api.v1.database` 等）。
- **会话级 schema 与最小种子**：autouse 会话夹具建表 + 种入 `admin(id=1)` 与 `Cluster(1..3)`；会话结束 dispose 引擎并删除临时目录。
- **跨事件循环安全**：测试引擎使用 `NullPool`（`pytest-asyncio` auto 模式下每用例独立 loop，池化连接跨 loop 复用会报 attached to a different loop）。
- **修正两处残余用例**：① `test_database.py` 的引擎构建器用例改经新夹具 `real_create_sync_engine` 取回真实实现（重定向会替换模块属性）；② `test_route_list_api.py` 的插件过滤用例改为**自给自足种子**（种入带 `proxy_rewrite` 的路由 + 一条不带），消除长期记录的既有失败。
- **文档同步**：`AGENTS.md` #30 由"禁止跑全量 pytest"改写为"全量可跑且隔离已强制"。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `test-harness`：「隔离」的适用范围从"使用夹具的测试"扩展为**全部测试**（含未迁移文件与应用 lifespan 路径）；"Per-File Migration" 需求被单点全局重定向取代；"No Real Database Writes" 的验证场景对齐 PostgreSQL 活动库。

## Impact

- 代码：`backend/tests/conftest.py`（新增全局重定向与夹具，不改动既有 `test_db` / `isolated_app` / `async_isolated_client` 语义）；`backend/tests/test_database.py`、`backend/tests/test_route_list_api.py`（用例自足化）；`AGENTS.md` #30
- 测试：全量 `uv run pytest -q` **102 failed → 0 failed**（1615 passed / 12 skipped / 188s），且运行期真实库审计日志无新增条目、临时库目录无残留
- 数据：无生产代码改动、无表结构改动；测试不再读写真实活动库
- 依赖：无新增依赖
- **非目标**：不做逐文件夹具迁移（被单点重定向取代）；不消除**同一会话内**测试间的数据串扰（与改造前等价，后续可用按模块清库另立项）；不改动 `PG_DSN` opt-in 的真实 PG 迁移测试（保持显式开关）

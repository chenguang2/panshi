## Context

测试套件的隔离能力由两代机制叠加而成：

1. **夹具代（2026-09-12，已归档）**：`test_db`（ORM 内存库）、`isolated_app`（sync TestClient + get_db override）、`async_isolated_client` / `async_authed_client`（httpx ASGI）、`unauthenticated_app`。这些夹具**只在被使用时**生效。
2. **真实库残余**：23 个测试文件直接构造 `TestClient(app)` / `httpx.AsyncClient(ASGITransport(app=app))`，未使用上述夹具 → 命中 `db_config.json` 的 active 连接。

活动库切 PG 后第 2 类文件全部爆掉（102 failed），且构成真实库写入风险。

## Goals / Non-Goals

**Goals**
- 任何测试（无论是否使用夹具、无论是否触发应用 lifespan）都不读写真实活动库
- 全量 `uv run pytest -q` 在 active=PostgreSQL 时可用且全绿
- 不要求逐文件改造（对未迁移文件"零改造"生效），新写测试自动继承

**Non-Goals**
- 消除同一会话内测试间的数据串扰（改造前同样存在，另行立项）
- 把真实 PG 的方言回归纳入常规全量（保持 `PG_DSN` opt-in 测试的显式开关语义）
- 改写既有夹具的行为契约（`test_db` / `isolated_app` / `async_isolated_client` 语义不变）

## Decisions

### D1：单点全局重定向，取代逐文件迁移
`AGENTS.md` #30 的 45 文件清单是"逐文件改造"路线的产物，执行成本高且**新测试会持续回退**（新增文件默认直连真实库）。改为在 `conftest` 导入期把 `app.core.database` 的全局引擎与会话工厂整体钉到隔离库：单点、全量覆盖、对未迁移文件零改造。
- 权衡：侵入"全局状态"，但测试环境本就允许 monkeypatch；相较 45 个文件的手工迁移与持续守卫成本，收益显著。

### D2：`NullPool`，禁用连接池复用
`pytest-asyncio`（`asyncio_mode=auto`）为每个用例创建独立事件循环；aiosqlite 连接绑定创建时的事件循环，池化复用会报 `attached to a different loop`。测试引擎使用 `NullPool`，每次 checkout 新建连接、用完即关。
- 权衡：轻微性能损失（可忽略，全量 188s），换取跨 loop 稳定。

### D3：临时 SQLite **文件**，而非 `:memory:`
`TestClient` 的 portal 线程、`httpx` ASGI 传输与直连 session 需要共享同一个库。`:memory:` 在 SQLite 下每个连接一个独立库（除非用 StaticPool 单连接），与多线程/多 loop 混用会得到割裂视图。会话级临时文件天然共享，且会话结束可整体删除。

### D4：按对象身份清扫 `sys.modules` 陈旧引用
`from app.core.database import AsyncSessionLocal` 在导入时刻绑定对象，patch 模块属性无法影响已导入方（实测 `app.main`、`app.api.v1.database`、`node_task_service` 的函数体内延迟导入也依赖模块属性）。
- 实现：导入期记录真实对象；会话夹具（收集完成后执行）遍历 `sys.modules`，凡属性 `is` 真实对象的替换为测试对象。
- 权衡：全模块扫描有一次开销（毫秒级）；身份比对保证不误伤同名属性。

### D5：`_reload_active_engine` 置为 no-op（不改指回真实）
数据库切换类端点/服务会调用 `_reload_active_engine()` 依据 `db_config.json` 重建引擎——若保留原实现，测试中途会把引擎重新指回真实库。置 no-op 后引擎始终停在隔离库；`create_sync_engine` 亦重定向，保证应用 `init_db()`（未 stub lifespan 的测试会真实触发）只作用于隔离库。

### D6：最小种子维持 admin + Cluster(1..3)
与既有夹具一致（`SEED_CLUSTER_IDS`），保证外键依赖与登录可用；其余数据由各测试自建（隔离库不提供"生产数据"，依赖真实数据的用例必须自足化——本变更据此修正了插件过滤用例）。

### D7：PG 方言信号用「真实 PG 的专用 schema」而非改默认后端
隔离解决了安全与确定性，但**默认隔离库是 SQLite → 失去 PG 严格类型/方言信号**（2026-09-17 的两起事故正是该类别）。取舍：

- **不把 PG 设为默认**：默认必须零外部依赖（本地/CI 无 PG 也能跑）。
- **不逐用例建 PG schema**：数百次 `CREATE SCHEMA` + `create_all` 会把全量从 3 分钟推到不可接受。
- **采用**：`TEST_DB_BACKEND=pg`（opt-in）把同一单点重定向指向真实 PG 的 `panshi_test` schema；`init_db()` 生产启动路径在该 schema 内 create_all + 迁移；会话结束 `DROP SCHEMA CASCADE`，`public` 零影响。另加 `tests/test_pg_dialect_smoke.py` 固化高风险写路径，并配 `global_engine_client` 夹具（不覆盖 `get_db`，因此真的打到重定向后的引擎）。
- **残余局限（诚实记录）**：用例级隔离夹具（`isolated_app` / `async_isolated_client`）仍用内存 SQLite，故 PG 模式下这些用例不产生 PG 信号；PG 信号覆盖"走全局引擎"的用例（未迁移文件 + 冒烟）。若要全用例 PG 覆盖需按用例建 schema，成本与收益不匹配，暂不做。

## Risks / Trade-offs

- **测试间数据串扰仍在**：会话级共享一个临时库，前序测试的写入会影响后续测试（与改造前等价）。若需强隔离，可后续引入"按模块清库/事务回滚"。
- **依赖真实数据的用例会被暴露**：隔离后不提供生产数据，隐藏依赖会显性失败（本次即修 2 例）。这是收益而非代价——它把隐性耦合转为可见失败。
- **PG 信号的覆盖边界**：见 D7——PG 模式下用例级隔离夹具仍为 SQLite，PG 信号来自走全局引擎的用例（含 7 条专用冒烟）。
- **`PG_DSN` opt-in 测试不受影响**：迁移/归档类测试自建引擎，仍显式开关；常规全量不会连真实 PG。
- **`reload` 语义在测试中失真**：切库类用例不能再验证"引擎真的重建"。当前此类用例断言的是配置读写与服务层行为，未覆盖重建；如将来需要，可在用例内显式调用真实实现（同 `real_create_sync_engine` 夹具模式）。

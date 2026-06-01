## Why

后端的 SQLite 数据库访问存在 6 处同步/异步混用隐患，包括 AsyncSession 被当作 sync Session 传递、sync engine 重复创建、async_sessionmaker 绑错 engine 类型等。这些隐患在 SQLite 下可能导致运行时崩溃（`AttributeError`）、数据竞争、`database is locked` 等问题。

## What Changes

### Bug 1：统一 sync engine 创建
三处独立的 sync engine 创建（`core/database.py`、`edge_import_service.py`、`cluster_static_resources.py`）整合为 module 级共享 `_sync_engine`，避免多连接争抢同一 SQLite。

### Bug 2：修正 `SyncSessionLocal` 类型
`core/database.py` 的 `SyncSessionLocal = async_sessionmaker(bind=_sync_engine)` — `async_sessionmaker` 应配 async engine。改为用 sync 的 `sessionmaker`，或直接移除（如果无调用方）。

### Bug 3：`cluster_routes.py` AsyncSession → sync Session
发布路由时把 FastAPI 注入的 `AsyncSession` 当作 sync `Session` 传给 `EdgeClient`，导致 `.query()` 崩溃。改为创建独立 sync session，与 `cluster_static_resources.py` 一致。

### Bug 4：`edge_import_service.py` sync session 泄漏到 async
`__init__` 中创建的 sync session 被 `self.client` 持有，跨 async 方法共享。改为在 `__init__` 中用完后立即关闭，或使用 context manager。

### Bug 5：`cluster_static_resources.py` async + sync 同函数混用
同一函数内用 async session 查 Node，又用 sync session 调 EdgeClient。功能上可接受，但需确保 `try/finally` 正确关闭 sync session。

### Bug 6：`StaticPool` + `check_same_thread=False` 安全加固
修复 Bug 1 后各处的 `StaticPool` 自然合并为单连接池，降低并发冲突概率。

## Capabilities

### New Capabilities
（无新增 capability）

### Modified Capabilities
（无 spec 级行为变更，纯代码质量修复）

## Impact

- `backend/app/core/database.py` — 修正 SyncSessionLocal 类型，导出共享 sync engine
- `backend/app/services/edge_import_service.py` — 复用共享 sync engine，清理 session 生命周期
- `backend/app/api/v1/cluster_routes.py` — 发布路由时使用独立 sync session
- `backend/app/api/v1/cluster_static_resources.py` — 复用共享 sync engine 替代自建

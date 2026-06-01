## Context

后端存在多处同步/异步 DB 混用，包括 `EdgeClient.db` 参数类型不匹配、三处独立 sync engine 工厂、`SyncSessionLocal` 死代码、`cluster_static_resources` 多余的 sync DB 查询、`edge_import_service` sync session 泄漏等。

## Goals / Non-Goals

**Goals:**
- 统一 sync engine 创建，消除多连接争用
- 修复 EdgeClient 类型安全（`db` 改为 Optional）
- 消除 `cluster_static_resources` 的冗余 sync DB 查询
- 修复 `edge_import_service` 的 sync_db 泄漏
- 清理 `SyncSessionLocal` 死代码
- 修复日志器目录创建和测试覆盖

**Non-Goals:**
- 不改动业务逻辑
- 不改动 API 返回结构
- 不改动 EdgeClient 的 HTTP 行为

## Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| EdgeClient.db 类型 | `Optional[Session]` 默认 None | 所有调用方都传 IP+port，db 参数实际不用 |
| sync engine 统一 | `get_sync_engine()` 共享函数 | 消除三处独立 create_engine |
| cluster_static_resources | 移除 admin_key 覆盖 | 其他 publish 都不覆盖，统一行为 |
| edge_import_service 构造函数 | async factory `create()` | 消除构造函数内 sync DB 查询 |

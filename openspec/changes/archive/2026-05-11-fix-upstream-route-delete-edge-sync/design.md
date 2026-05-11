## Context

`delete_upstream` (`clusters.py:333`) 和 `delete_route` (`routes.py:215`) 当前仅执行 `await db.delete(record)` + `await db.commit()`。Edge 客户端已有 `delete_upstream(upstream_id)` 和 `delete_route(edge_uuid)` 方法，但未在删除 API 中调用。

## Goals / Non-Goals

**Goals:**
- 删除上游/路由时同步从所有活跃 Edge 节点删除
- 部分节点删除失败不影响整体删除结果

**Non-Goals:**
- 不改变前端删除交互逻辑
- 不新增 API 端点

## Decisions

### Decision 1: 删除顺序

**选择: 先删 Edge，再删 DB**

Edge 删除失败时保留 DB 记录，用户可重试；若先删 DB 再 Edge 失败，则 DB 中已无记录导致无法重试。

### Decision 2: 部分节点失败处理

**选择: 逐个节点调用，记录结果，不因单节点失败回滚**

与 `publish_upstream` 保持一致的模式。返回每个节点的删除结果。

### Decision 3: 返回值

**选择: 返回 `{message, results}` 格式，包含每个节点的删除状态**

## Risks / Trade-offs

- [风险] 节点不可达导致 Edge 删除失败 → 记录日志，返回部分失败结果，DB 记录已删除

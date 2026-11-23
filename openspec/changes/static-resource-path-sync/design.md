# Design

## D1 写入侧回写，读取侧不动（方案 A）

`url_path` 的消费方有四处（卡片「路径」行、发布确认摘要 `publish-node-select`、上传日志行、集群导出 Excel 的路径列）。把四处都改成 `route_uri || url_path` 只是掩盖脏数据，导出与历史快照仍是旧值；回写一次即四处同时正确，且以后新增消费方自动受益。

## D2 回写条件：`url_path IS DISTINCT FROM route.uri`（含 NULL），而非「仅当本次改了 uri」

- 幂等自愈：存量脏行（活动库现有一条：`url_path='/*'` vs `/webTrade/*`）不需要单独的数据修复脚本，下次保存路由即纠正。
- 无差异时 0 行受影响，无写入成本；无静态资源时同样空操作。
- SQLite/PG 双方言下都用 `WHERE url_path != :uri OR url_path IS NULL`（不用 PG 专有的 `IS DISTINCT FROM`，保持双方言一致）。

## D3 不动 `updated_at`：路径变更不是「待发布」

`ps_static_resource.updated_at` 驱动前端/后端的待发布判定（`updated_at > last_published_at`）。发布只按 `edge_uuid` 传 zip，URI 变更不需要重发文件；若让 `onupdate=datetime.utcnow` 生效，用户会看到一张无意义的「待发布」卡片。实现上用 Core `update()` 并把 `updated_at` 显式赋回自身列，抑制 onupdate：

```python
table.update()
     .where(table.c.route_id == route_id, or_(table.c.url_path != route.uri, table.c.url_path.is_(None)))
     .values(url_path=route.uri, updated_at=table.c.updated_at)
```

## D4 位置：`update_route` 内、`db.commit()` 之前

同一会话/同一事务：路由改动与静态资源回写要么都生效要么都不生效；审计骨架的 `resource_id/detail` 仍只描述路由变更（路径回写属派生字段，不单独审计）。

## D5 测试策略（TDD，#16）

新增 `backend/tests/test_static_resource_path_sync.py`（直调 `update_route`，注入 `SimpleNamespace(state=SimpleNamespace(audit=None))` 假 request）：

1. 改 URI → `url_path` 跟随、`updated_at` 不变（RED 先跑）。
2. 未改 URI（只改描述）+ 存量脏行 → 自愈。
3. `url_path IS NULL` → 回写。
4. 路由无静态资源 → 正常成功、无写入。
5. 回归 `test_static_resource_rebind.py`（换绑四字段同步语义不受影响）。

## D6 已知边界

- 只同步「同一路由下的资源」；跨路由换绑仍走既有 `update_static_resource` 四字段同步（含 `url_path`），语义不变。
- 路由被删除时 `route_id` 置 NULL、`url_path` 保留最后已知值（既有行为，卡片显示「关联路由已删除」）。
- 不做定期巡检任务：自愈触发点 = 路由保存；无需要求后台扫描。

# Design

## Context

- 老 12 资源页的组筛选为数据级：`group_name` 直发服务端（`group-filter-on-resource-pages` 既有需求「Group filter is server-side via API parameter」），9 个全局端点支持（8 端点族 + `upstreams.py`）。
- 自启动页：`groupFilter` → `filteredClusters` 只收窄候选；`onGroupChange` 清集群筛选 + `loadNodes()`，但 `loadNodes` 只传 `clusterId`——选组后列表回到全部。后端 `GET /nodes`（nodes.py）已支持 `group_name`，前端 `api/nodes.ts listNodes` 已支持 `groupName` 序列化——只差接线。
- 节点任务页：`filterGroup` → `filteredClusters` 只收窄候选；`onFilterGroupChange` 已清集群筛选并 `loadTasks(1)`，但 `listParams()` 不含 `group_name`；后端 `GET /node-tasks`（node_tasks.py `list_all_tasks`）无该参数。
- `_task_list_stmt` 已 LEFT JOIN Cluster（取集群展示名），加分组过滤无需新 JOIN。
- 后端测试范式：`tests/test_node_list_api.py::test_list_nodes_group_filter*`（种子 2 分组集群 + 1 未分组集群、精确断言防「空转假绿」）。

## Goals / Non-Goals

**Goals:**
- 两页组筛选对齐数据级语义（选组 → 列表变化），与老 12 页行为一致。
- 最小改动面：自启动 = 前端接线；节点任务 = 后端一参数 + 前端接线。

**Non-Goals:**
- 不改 ClusterSelect（分组头保持不可选，仅收窄候选——2026-11-12 用户裁决）。
- 不给集群子页任务端点（`/clusters/{id}/node-tasks`）加 group 参数。
- 不动其余 12 页（已达标）。

## Decisions

- **D1 分组过滤进 `_task_list_stmt`**（而非端点内后置过滤）：与 cluster_id/status 等条件同层，列表与分页计数一次成型；`list_all_tasks` 加 `group_name: Optional[str] = Query(None)`，`_parse` 层不涉及（纯字符串）。语义镜像 nodes.py：`__ung__` → `Cluster.group_name.is_(None) | (Cluster.group_name == "")`；具名 → `Cluster.group_name == <name>`；`__all__`/None → 不过滤。
- **D2 已删除集群的历史任务落 `__ung__` 桶**：`_task_list_stmt` 对 Cluster 是 outerjoin，集群已删除的任务行 Cluster 列全 NULL，会被 `__ung__` 的 `is_(None)` 命中。接受（与「未分组=没有分组归属」的语义兼容，且集群名占位符本就按无集群呈现）；不为它特判。
- **D3 前端参数命名各从其模块现状**：`api/nodes.ts` 用 camelCase 入参（`groupName`），`useNodeTasks.listNodeTasks` params 直透（snake_case `group_name`）——不改公共模块签名，调用侧对齐即可。
- **D4 节点任务页深链同步 `group`**：`currentListQuery()` 写 `query.group`、`restoreFiltersFromQuery()` 回填——对齐既有 `cluster` 深链；参数名用短名 `group` 与同族（q/status/type/range/cluster）一致。
- **D5 `hasActiveFilters` 纳入 `filterGroup`**：组筛选从「候选收窄」变为真实筛选后，空态文案（没有任务 vs 没有符合条件）必须把它算进去。
- **D6 级联行为不动**：两页 `onGroupChange`/`onFilterGroupChange` 已「清集群筛选 + 重载」，与老 12 页（UpstreamList `onGroupChange`）同款——只补数据参数，不碰级联。

## Risks / Trade-offs

- 自启动页 `loadNodes(pageSize: 500)` 为全量拉取（客户端分页），group 过滤在服务端生效后返回行数只会更少——无分页边界风险。
- 节点任务页轮询（`listParams` 列表与轮询共用）自动带上 group——轮询不会丢筛选（既有设计约束，D 保持）。
- 后端加参数对既有调用方零影响（缺省 None → 不过滤）；`test_node_task_api.py` 既有用例不受影响。

## Open Questions

（无——2026-11-12 讨论已裁决：不做 ClusterSelect 语义变更；节点任务走「后端加参数」方案 a。）

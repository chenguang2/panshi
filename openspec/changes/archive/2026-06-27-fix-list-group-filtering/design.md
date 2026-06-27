## Context

当前资源列表页（路由、上游、节点、插件组、全局规则、插件元数据、静态资源、四层代理）在分组过滤模式下使用 `GROUP_MODE_PAGE_SIZE=500` 一次拉回全部数据，然后在前端按 `group_name` 做客户端过滤。这种方式有两个缺陷：

1. **数据截断**：后端 `MAX_PAGE_SIZE=500` 是硬限制，当全局记录超过 500 时，分组结果静默丢失超出部分的数据
2. **无持久化分页**：分组模式下翻页是前端内存分页，刷新页面后丢失状态

同时，表单下拉选择器（上游选择、节点选择、路由选择等）使用 `page_size=100` 或 `200`，当资源超过该数量时选项不完整。

已有 `group-filter-on-resource-pages` spec 明确要求"纯前端实现、不改后端"，本次变更需将该决策改为后端服务端过滤。

## Goals / Non-Goals

**Goals:**
- 后端所有全局列表 API 支持 `group_name` 查询参数，在 SQL 层面按分组过滤（需要做 Cluster JOIN）
- 前端列表页移除 `GROUP_MODE_PAGE_SIZE` 客户端过滤，改为将 `group_name` 传给 API，保持正常服务端分页
- 表单下拉选择器的 `page_size` 统一提升至 500，确保完整展示
- 更新 `group-filter-on-resource-pages` spec

**Non-Goals:**
- 不涉及下拉选择器的远程搜索（后续单独优化的体验问题，不涉及数据丢失）
- 不涉及 Pinia 缓存（同上）
- 不涉及集群详情 Tab 内的分页逻辑（已有正确实现）
- 不涉及 dashboard 等非列表页面

## Decisions

### Decision 1: 后端 `group_name` 参数实现方式

**选择**：全局列表端点新增 `group_name` 查询参数，类型为 `str = Query("__all__")`，默认 `"__all__"` 表示不过滤。后端始终接收此参数，显式判断是否需要过滤。

**理由**：
- 每个资源 model 都有 `cluster_id` 外键，Cluster model 有 `group_name` 字段
- 通过显式 JOIN 是最直接的方式，不用新增独立接口
- 默认 `"__all__"` 与前端始终传 `group_name` 的决策一致，API 更清晰

**涉及端点**（8 个全局列表 API）：

| 路由文件 | 端点 | 当前默认 page_size |
|---|---|---|
| `routes.py` | `GET /routes` | 20 |
| `upstreams.py` | `GET /upstreams` | 20 |
| `nodes.py` | `GET /nodes` | 20 |
| `plugin_configs.py` | `GET /plugin_configs` | 20 |
| `global_rules.py` | `GET /global_rules` | 20 |
| `plugin_metadata.py` | `GET /plugin_metadata` | 20 |
| `static_resources.py` | `GET /static_resources` | 20 |
| `cluster_stream_proxies.py` | `GET /stream-proxies` | 20 |

**前提：Model 没有定义 `relationship`** — 所有 Model（Route, Upstream, Node 等）只有 `cluster_id` 外键列，没有 `relationship('Cluster')`。所以必须用显式 JOIN 语法。

**实现模式**（以 routes.py 为例）：
```python
@router.get("/routes")
async def list_all_routes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    group_name: str = Query("__all__"),  # 新增，默认不过滤
    ...
):
    query = select(Route)

    # Group filter — 需要显式 JOIN Cluster 表（无 relationship 可用）
    if group_name == "__ung__":
        query = query.join(Cluster, Route.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, Route.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

    # ... 其余过滤条件
```

### Decision 2: "未分组" 的语义

前端传递特殊值 `__ung__`（与现有代码统一）表示查询"未分组"的集群。后端需要同时覆盖 `NULL` 和 `""` 两种情况，因为 `group_name` 列当前为 `nullable=True`。

查询条件：
```python
if group_name == "__ung__":
    query = query.join(Cluster, Resource.cluster_id == Cluster.id).where(
        Cluster.group_name.is_(None) | (Cluster.group_name == "")
    )
```

同时，修改 Cluster model 的 `group_name` 列定义，增加 `default=""`，确保新建集群时默认值统一为空字符串而非 NULL。


### Decision 3: 前端列表页改动模式 — 始终传 `group_name`

**统一原则**：所有 8 个全局列表视图**始终在 API 调用中传 `group_name`**（无 if/else 条件判断），取值就是 `groupFilter.value` 的值（`"__all__"` / `"__ung__"` / 具体分组名）。后端统一处理 `group_name` 参数，`"__all__"` 表示不过滤。

**理由**：始终传参避免了 8 个视图各自判断是否传的逻辑分支，API 契约更清晰，不易遗漏。

涉及两种布局的视图：
- **卡片网格**（PluginConfigList、GlobalRuleList、PluginMetadataList、StaticResourceList、StreamProxyList）
- **表格**（RouteList、UpstreamList、NodeList）

**统一的前端代码模式**：
```typescript
const params: Record<string, any> = {
  page: page.value,
  page_size: pageSize.value,
  group_name: groupFilter.value,  // 始终传："__all__"/"__ung__"/具体分组名
}
if (clusterFilter.value) params.cluster_id = clusterFilter.value
if (searchText.value) params.search = searchText.value
```

**StreamProxyList 需要特殊对齐**：当前它用 `clusterFilter` 作为分叉条件（有 cluster 时正常分页、无 cluster 时无条件拉 500 条），而不是用 `groupFilter`。需要改为与其他视图一致：始终传 `group_name`，按 `groupFilter` 做正常的服务端分页。

**NodeList `statusFilter` 共存处理**：当前 `loadAll = isGroupMode || hasStatus`，`statusFilter` 完全在客户端过滤（后端不支持按 status 参数过滤）。改后：
- `group_name` 始终传
- 当 `hasStatus=true` 时仍需拉取足够数据做客户端状态过滤，此时保留 `page_size=500`
- 当 `isGroupMode=true` 时传 `group_name`，后端做服务端分组过滤
- `displayedNodes` computed 保持现有双层过滤逻辑不变（先 group 过滤集群维度，再 status 过滤节点维度）

### Decision 4: 下拉选择器 page_size 提升

- 表单/列表中的下拉选择器（上游、节点、路由、plugin_configs）：`page_size` 改为 500
- 集群下拉：`page_size` 改为 500（当前为 200）
- 涉及文件：`RouteFormModal.vue`, `RouteList.vue`, `StreamProxyFormWizard.vue`, `EdgeEnv.vue`, `ClusterList.vue`, `CentralList.vue` 等

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **性能**：8 个端点新增 Cluster JOIN，大数据量下可能变慢 | `Cluster.group_name` 加索引 `idx_cluster_group_name`；仅当 `group_name` 参数传值时做 JOIN，不影响默认路径 |
| **部署顺序**：后端参数改为 `str = Query("__all__")`，旧前端不传此参数时默认 `"__all__"`，行为兼容 | 可任意顺序部署，无兼容问题 |
| **"未分组"语义**：前端可能传递误拼的特殊值 | 后端只识别 `__ung__` 一个特殊值，其余作为字面 group_name 查询；同时需处理 NULL + 空字符串两种情况 |
| **下拉 page_size 提升到 500**：部分场景下拉数据变大，首次加载变慢 | 管理后台场景，500 条 JSON 约 50-200KB，一次传输可接受。如果后续出现性能问题，再针对性加远程搜索 |
| **数据库 migration**：`group_name` 列加 `default=""`，现有 NULL 数据需清理 | 添加数据库迁移脚本，将现有 `group_name IS NULL` 的记录更新为 `group_name = ''`。同时后端查询仍需保留 `IS NULL OR = ''` 的双重判断，确保迁移前后的兼容性 |

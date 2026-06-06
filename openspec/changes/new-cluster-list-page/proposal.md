## Why

`/clusters` 路由当前为占位页，需要实现一个全新的集群管理列表页面。该页面专注集群本身的展示和操作（卡片网格、统计、筛选、CRUD），与已有的"集中管理"页面（CentralList.vue）完全独立。设计参考 `docs/ui/Live-Artifact-4/clusters.html`。

## What Changes

1. **New ClusterList view at `/clusters`** — 替换占位页，实现完整的集群卡片网格页面
2. **Cluster card with 7-category stats** — 卡片显示节点、上游、路由、插件组、全局规则、插件元数据、静态资源的统计计数
3. **Remove sync button** — 集群卡片中去掉同步按钮
4. **Group name in card header** — 分组名称放到卡片标题头中展示
5. **Group-based categorization and sorting** — 卡片按分组分类排序，每组显示分组标题头
6. **Group name dropdown filter** — 筛选栏增加分组名称下拉选择条件
7. **Backend: add `plugin_metadata_count`** — ClusterResponse 增加缺失的 `plugin_metadata_count` 字段

## Capabilities

### New Capabilities
- `cluster-list-page`: 新建集群管理列表页面，包含卡片网格、统计展示、分组分类、筛选搜索、CRUD 操作

### Modified Capabilities
- 无（不修改现有 spec，这是全新页面）

## Impact

- **前端新建**：`frontend/src/views/ClusterList.vue` — 替换当前占位页，实现完整集群列表页面
- **前端**：`frontend/src/components/AppSidebar.vue` — 集群管理菜单项已存在，路由不变
- **后端**：`backend/app/schemas/cluster.py` — ClusterResponse 增加 `plugin_metadata_count: int = 0`
- **后端**：`backend/app/api/v1/clusters.py` — 集群列表查询增加 `plugin_metadata_count` 统计计数
- **后端不修改**：不涉及集中管理页面（CentralList.vue）的任何改动

## Context

当前 `showDeleteConfirm` 弹窗对"Edge 节点"只有单一 checkbox，选中后后端遍历所有活跃节点逐一删除。用户无法排除特定节点。

后端 `DeleteClusterRequest` 已有 `delete_db` 和 `delete_edge` 两个布尔字段。删除操作在收到 `delete_edge=true` 后，查询所有 `status=1` 的活跃节点执行操作。

## Goals / Non-Goals

**Goals:**
- 勾选"Edge 节点"后显示节点列表，每个节点可独立勾选
- 默认全选
- 所有资源类型的删除弹窗统一使用此行为
- 后端 `DeleteClusterRequest` 增加可选的 `node_ids` 字段

**Non-Goals:**
- 不改变数据库删除逻辑
- 不改动发布弹窗（保留现有节点选择模式即可）
- 不涉及 Edge 节点的 API 变更

## Decisions

1. **`showDeleteConfirm` 中展开节点列表** — 在"Edge 节点" checkbox 下方动态渲染节点列表
2. **`PluginMetadata.vue` 独立改造** — 该组件有自己的删除弹窗，需要单独修改
3. **所有删除操作统一修改** — 上游、路由、插件组、全局规则、静态资源（共用 `showDeleteConfirm`）+ 插件元数据（独立弹窗）
4. **已存在的节点数据** — 集群已有 `cluster.nodes` 数据，插件元数据可通过 props 传入 clusterId 查询节点
5. **`node_ids` 为空 = 全部节点** — 前端不传 node_ids 时后端仍按原有逻辑（查所有活跃节点）

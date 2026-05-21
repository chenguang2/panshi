## Why

集群管理中的删除弹窗（上游、路由、插件组、全局规则、静态资源），勾选"Edge 节点"后默认删除所有活跃节点，无法选择只删除部分节点。用户需要能够精确控制要删除哪些 Edge 节点，避免误删。

## What Changes

- **修改 `showDeleteConfirm` 弹窗**：当勾选"Edge 节点"时，展开显示所有活跃节点的列表（IP:port），每个节点前有 checkbox，默认全选
- **用户可以取消勾选**不想删除的节点
- **后端 API 无变化**，前端只传选中的 node_ids
- **所有资源类型的删除弹窗统一修改**：上游、路由、插件组、全局规则、静态资源

## Capabilities

### New Capabilities
- `delete-node-selection`: 删除弹窗中 Edge 节点级联选择功能

## Impact

- 前端：`ClusterList.vue` 中的 `showDeleteConfirm` 函数，新增节点列表渲染逻辑
- 前端：所有 `onOk` 回调需将选中的 node_ids 传给后端
- 后端：删除 API 的 `DeleteClusterRequest` 中增加 `node_ids` 字段（可选，为空时表示全部节点）

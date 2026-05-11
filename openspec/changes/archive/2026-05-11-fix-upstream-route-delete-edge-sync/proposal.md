## Why

删除上游或路由时，仅从本地数据库删除记录，未同步删除 Edge 节点上的对应资源，导致 Edge 节点保留孤儿数据。

## What Changes

- `delete_upstream` 增加对活跃 Edge 节点的 `DELETE` 调用，同步删除 Edge 节点上的上游
- `delete_route` 增加对活跃 Edge 节点的 `DELETE` 调用，同步删除 Edge 节点上的路由
- 集群管理页面"全局插件" Tab 显示名称改为"插件元数据"

## Capabilities

### New Capabilities
<!-- None - this is a bug fix -->

### Modified Capabilities

- `upstream`: `delete_upstream` 删除行为改为 DB + Edge 同步删除
- `route-sync`: `delete_route` 删除行为改为 DB + Edge 同步删除

## Impact

- `backend/app/api/v1/clusters.py` — `delete_upstream` 函数
- `backend/app/api/v1/routes.py` — `delete_route` 函数
- `frontend/src/views/ClusterList.vue` — "全局插件" Tab 名称

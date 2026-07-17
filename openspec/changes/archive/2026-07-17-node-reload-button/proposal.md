## Why

节点管理列表页面的操作栏有启动、停止按钮，但没有重新加载（reload）按钮。用户需要 reload 配置时需要去其他页面操作，体验不完整。后端已有 `POST /clusters/{id}/nodes/{nid}/restart` 接口支持 nginx_reload，前端只需补齐按钮。

## What Changes

1. **新增 reload 按钮** — 在节点操作栏中启动/停止旁边新增"⟳ reload"按钮，调用 `POST /clusters/{id}/nodes/{nid}/reload`
2. **新增后端 `/reload` 路由**（代理到已有 `/restart` 的 `nginx_reload` 逻辑）
3. **详情按钮移到更多菜单** — 原有"ⓘ 详情"按钮从操作栏移入"⋯"下拉菜单，放在"编辑"上方

## Capabilities

### New Capabilities
- （无，reload 作为 Single node restart 的前端入口，归入 edge-node-lifecycle）

### Modified Capabilities
- `edge-node-lifecycle`: 新增 Single node reload 的前端操作入口

## Impact
- `backend/app/api/v1/cluster_nodes.py` — `POST /{cluster_id}/nodes/{node_id}/restart` 路由改名为 `/reload`
- `frontend/src/views/NodeList.vue` — 操作栏按钮布局调整 + 新增 handleReload 函数
- `frontend/src/views/clusters/ClusterNodes.vue` — 同上

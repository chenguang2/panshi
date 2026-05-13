## Why

集群管理缺少全局规则功能。全局规则是一组可以在路由间复用的全局生效插件，和插件组类似但不需要路由引用，配置后全局生效。

## What Changes

- 集群管理新增"全局规则"Tab，卡片式展示
- 后端 CRUD + 发布 + 版本管理（8个端点）
- 全局规则仅支持 traceid 和 monitor 两个插件

## Capabilities

### New Capabilities
- `cluster-global-rules`: 集群级别的全局规则 CRUD、发布、版本管理

## Impact

- `backend/app/models/cluster.py` — 新增 GlobalRule 模型
- `backend/app/schemas/cluster.py` — 新增 GlobalRule schema
- `backend/app/api/v1/clusters.py` — 新增 8 个端点
- `backend/app/api/v1/plugins.py` — 新增 traceid、monitor 插件
- `frontend/src/views/ClusterList.vue` — 新增全局规则 Tab

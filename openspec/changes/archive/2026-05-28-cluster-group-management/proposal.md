## Why

集群卡片过多时占用大量空间，需要分组管理。

## What Changes

- 数据库 `ps_cluster` 新增 `group_name` 字段
- 编辑集群时可设置分组（下拉选择已有分组或输入新分组）
- 集群列表按分组折叠展示，组内卡片可统一折叠/展开
- 前端类型 `Cluster` 新增 `group_name`

## Impact

- `backend/app/models/cluster.py` — 新增 group_name 列
- `backend/app/schemas/cluster.py` — schema 支持 group_name
- `frontend/src/views/ClusterList.vue` — 分组展示 + 编辑
- `frontend/src/types/index.ts` — Cluster 接口

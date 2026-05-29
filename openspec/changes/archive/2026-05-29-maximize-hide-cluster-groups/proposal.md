## Why

当前集群最大化时，分组列表仅收起标题，仍占用顶部空间。最大化应隐藏分组列表，让最大化集群获得全屏显示区域，恢复时自动还原。

## What Changes

- 集群最大化（`maximizedClusterId` 非空）时，分组集群列表完全隐藏（`v-if="!maximizedClusterId"`）
- 退出最大化时，分组列表自动重新显示

## Capabilities

### New Capabilities
- （无新增）

### Modified Capabilities
- `cluster-card-grid`: 最大化状态下分组列表隐藏行为

## Impact

- `frontend/src/views/ClusterList.vue` — 分组容器增加 `v-if="!maximizedClusterId"`

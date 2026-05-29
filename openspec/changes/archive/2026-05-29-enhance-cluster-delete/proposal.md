## Why

当前集群删除的节点选择默认全选所有活跃节点，且二级确认流程中只有集群名称验证。需要对齐路由删除的行为：节点默认不选、用户主动选择要删除的节点。同时统一二级确认流程，只保留集群名称验证（去掉节点 IP:端口输入的设计复杂度），使操作更清晰安全。

## What Changes

1. **节点选择默认状态变更** — 删除弹窗中勾选"Edge 节点"后，节点列表**默认全部不选**（当前为默认全选），用户需手动勾选目标节点
2. **二级确认简化** — 删除二级确认弹窗统一只需输入集群名称验证，不再要求输入节点 IP:端口
3. **更新 delta spec** — `delete-node-selection` 中"默认全部选中"的 requirement 需改为"默认都不选"

## Capabilities

### New Capabilities

- （无新增能力）

### Modified Capabilities

- `delete-node-selection`: 节点选择默认状态从"全部选中"改为"全部不选"

## Impact

- **Frontend**: `frontend/src/composables/useClusterUtils.ts` — `showDeleteConfirm()` 中 `selectedNodeIds` 初始值从全量节点改为空集
- **Frontend**: `frontend/src/views/ClusterList.vue` — `deleteCluster()` 中二级确认弹窗简化，只保留集群名称输入验证
- **Specs**: `openspec/specs/delete-node-selection/spec.md` — requirement 更新默认行为

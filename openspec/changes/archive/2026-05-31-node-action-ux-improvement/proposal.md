## Why

Edge 节点启动/停止操作没有二次确认，误触可能导致生产流量中断。执行结果展示框（Modal 300px）太小，Ansible 输出几百行时显示不完全，信息混杂难以阅读。

## What Changes

1. **启动/停止二次确认** — 执行前弹出确认对话框，明确提示操作风险和目标节点
2. **结果展示重构** — 用 Drawer 替代 Modal，配合 Tab 分类展示（关键信息 / stdout / stderr / 命令）
3. **复制日志按钮** — 一键复制完整执行日志

## Capabilities

### New Capabilities
- `node-action-confirm`: 节点启停操作前的二次确认保护
- `node-action-result-display`: 基于 Drawer + Tab 的执行结果展示

### Modified Capabilities
- `node-action-progress-dialog`: 现有进度弹窗被新的 Drawer 组件替代

## Impact

- `frontend/src/components/NodeExecutionResultDrawer.vue` — 新建组件
- `frontend/src/composables/useClusterNodes.ts` — 修改 executeNodeAction，加确认逻辑和 Drawer 状态
- `frontend/src/composables/useClusterUtils.ts` — buildDeleteProgressContent 保留兼容，或废弃
- `frontend/src/views/clusters/ClusterNodes.vue` — 注册 Drawer 组件

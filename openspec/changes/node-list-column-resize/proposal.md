# Proposal

## Why

节点管理列表 10 列中仅「#」（45px）与「操作」（320px）有固定宽，中间 7 列全靠浏览器自动分配，且表格未启用横向滚动——不同分辨率/小屏下长内容列（Edge/OpenResty 安装路径等）被挤压截断，用户无法自主调整。用户裁决（2026-11-14）采用 **B + A 组合**：先横向滚动兜底，再上表头拖拽调宽 + 记忆。

## What Changes

- **B 兜底**：节点表启用横向滚动（`scroll.x = max-content`），`#` 与 IP 列固定左侧、操作列固定右侧——小屏内容不再挤压，横向滚动查看。
- **A 拖拽调宽**：表头右缘拖拽柄，按住左右拖实时调整列宽；`#` 列不参与（table-anatomy 钉 45px 标准），其余列（含操作）均可拖。
- **默认宽度**：当前多数列无 width，全部补默认 px（一次性定档，拖拽前的稳定基线）。
- **持久化与重置**：列宽按用户持久化（并入 `useColumnConfig('node_standalone')` 的个性化存储）；`ColumnConfigPopover` 内新增「重置列宽」入口。
- 做成可复用实现（useColumnConfig 扩展 widths 能力），路由/上游等列配置页后续可接入（本次不改）。

不做：密度预设（方案 C）、行展开/悬浮全文（方案 D）；集群 Tab 侧节点子表接入（后续复用时另行立项）。

## Capabilities

### New Capabilities

- `table-column-resize`: 列表表格的列宽个性化——横向滚动与关键列固定、表头拖拽调宽、默认宽度档、个人偏好持久化与重置（首期落地节点管理列表）。

### Modified Capabilities

（无——`node-management` 既有需求不涉及列宽；新能力独立承载。）

## Impact

- 前端：`frontend/src/composables/useColumnConfig.ts`（扩展 widths 持久化）、`frontend/src/views/NodeList.vue`（scroll/fixed/默认宽/拖拽柄/接 popover 重置）、`frontend/src/components/ColumnConfigPopover.vue`（重置列宽入口）。
- 测试：useColumnConfig widths 单测、NodeList 拖拽/持久化组件测试、真机 Playwright 拖拽验收。
- 零后端、零新依赖。

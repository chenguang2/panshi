# Design

## Context

节点管理列表（`NodeList.vue`）10 列中仅 2 列有固定宽，表格无横向滚动；列个性化已有单点 `useColumnConfig`（storage key `node_standalone`，承载列显隐/搜索/动作勾选，`ColumnConfigPopover` 为其 UI）。a-table 4.x 无内置列宽拖拽。方案经用户裁决（2026-11-14）：B 横向滚动兜底 + A 拖拽调宽组合，行为契约见 specs/table-column-resize/spec.md。

## Goals / Non-Goals

**Goals:**

- 任意分辨率内容可看全（滚动兜底）；用户可逐列调宽且跨会话保持。
- 复用现有个性化单点，不新增第二套存储。

**Non-Goals:**

- 不做密度预设、行展开；不改集群 Tab 侧节点子表（复用另行立项）；不加表头排序（约定 #260 已裁决不做）。

## Decisions

**D1 兜底先行（B）**：`:scroll="{ x: 'max-content' }"` + `#`/IP `fixed: 'left'`、操作 `fixed: 'right'`。固定列需要列有确定宽——与 D3 默认宽度档天然配合。此步独立可交付，小屏立即改善。

**D2 拖拽实现 = 表头右缘手柄 + 文档级 mousemove（A）**：`#headerCell` 插槽渲染手柄（常显 2px 握把线——用户评审裁决方案 1 克制版：默认融入边框色保证可发现性，悬停加深为 accent），mousedown 记录起点与当前宽，document mousemove 实时写 `columns[i].width`（响应式），mouseup 结束并持久化；`tableLayout: 'fixed'` 保证列宽严格生效。备选「整表 colgroup 直改」被否：antd 内部渲染 colgroup，直改会被重渲染吞掉；备选第三方库（vue-resizable 等）被否：为单点交互加依赖不值。最小宽度 80px clamp（`#` 45 不参与）。

**D3 全列默认宽度档**：`#` 45（anatomy 标准）、IP 140、所属集群 140、服务端口/管理端口 100、Edge/OpenResty 安装路径 220、状态 120、Edge 版本 110、操作 320。≥1366px 视口下核心列无需横向滚动即可见。

**D4 持久化并入 useColumnConfig 单点**：扩展该 composable 增加 `columnWidths`（Record<key, px>）+ `setColumnWidth` + `resetWidths`，与列显隐同 storage key 存储——列宽是列个性化的同类维度，不建第二套存储；后续路由/上游页零成本接入。「重置列宽」入口放 `ColumnConfigPopover`（列个性化的既有 UI 家）。

**D5 交付切分**：B 与 A 同变更内分两步任务交付（B 先行可独立验收）。

## Risks / Trade-offs

- [固定列 + 滚动在 a-table 需所有列有宽] → D3 默认档先行，缺宽列在 B 步即补齐。
- [拖拽把手与表头文字选中冲突] → mousedown 时 `preventDefault` + user-select 控制。
- [px 宽在大屏浪费小屏溢出] → scroll.x max-content 兜底溢出；大屏列宽只会更充裕，不处理自动收缩（保持用户意志优先）。

## Migration Plan

纯前端增量，无迁移。回滚 = 还原三个文件的 diff（useColumnConfig 扩展向下兼容，旧存储缺 widths 字段按默认档处理）。

## Open Questions

（无。）

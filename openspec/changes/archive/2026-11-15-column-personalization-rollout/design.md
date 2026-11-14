# Design

## Context

节点列表已交付列宽拖拽 + 列移动实时预览（能力 `table-column-resize` / `table-column-order`，已归档入主 spec），但实现内联在 `NodeList.vue`。上游/路由两个独立列表页现状：无 useColumnConfig、无 popover、无横向滚动；路由列带 `sorter: true`。范围经用户三问拍板：固定列 #/名称左、操作右；竖线一并推广；仅独立列表页（Tab 子表后续另行立项）。

## Goals / Non-Goals

**Goals:**

- 拖拽行为抽取为共享 composable，NodeList 改消费方（行为零变化），两页接入零复制。
- 两页获得与节点页一致的完整体验（滚动/固定列/调宽/移动/竖线/重置）。

**Non-Goals:**

- 集群 Tab 子表；列显隐接入；密度预设。

## Decisions

**D0 Spec 载体说明**：既有需求（列宽个性化/列顺序个性化）的需求措辞以节点列表首期为语境，本次推广以 ADDED 承载（新增「上游与路由列表」需求），不重写稳定需求块（#53 场景标识符纪律）。

**D1 抽取共享 composable `useColumnDragColumns`**：从 NodeList 抽出调宽/移动/FLIP/光标全部状态与处理器，入参为「当前列数组（响应式键序）+ 宽度/顺序读写器 + 例外键（不可移动列）+ 表头容器选择器」，返回 headerCell 模板所需的绑定（wrap 类、拖拽处理器）与 `dragSourceKey`。NodeList/UpstreamList/RouteList 三页消费。命名备选 `useColumnDrag` 语义偏窄（含调宽+移动两手势），定为 `useColumnDragColumns`。

**D2 两页各建个性化存储 key**：`useColumnConfig` 新 key `upstream_standalone` / `route_standalone`（与 `node_standalone` 同范式），宽度与顺序各自持久化互不影响；「重置列宽」入口为页头次级按钮（两页暂无列配置 popover，未来若加 popover 再收编）。

**D3 固定列选型（用户拍板）**：路由 = `#`/名称 fixed left、操作 fixed right；上游 = `#`/名称 fixed left、操作 fixed right（上游操作列现宽 150，保持）。默认宽度档按页内容定（设计期逐列给定，路由 URI/发布状态从宽）。

**D4 路由 sorter 手势冲突**：拖拽移动跨越表头后，浏览器会把 mouseup 后的 click 派发给 th → 触发排序。抑制方式 = 拖拽发生位移后置「刚拖拽」标志，在 th 的 click capture 阶段拦截一次并复位（不触碰 a-table 排序逻辑本身）。

**D5 竖线样式共享单点**：节点页竖线规则上移至全局样式表（`.grid-table` 类，1px `var(--border)` 内部竖线、末列豁免），三页表格挂同一类；节点页原 scoped 规则删除。

## Risks / Trade-offs

- [抽取回归风险：NodeList 行为必须零变化] → NodeList 既有 66 用例全程护航，抽取后原样通过才算完成。
- [路由表头点击排序与拖拽手势冲突] → D4 拦截仅作用于「发生位移的拖拽」，纯点击排序不受影响（组件测试钉住）。

## Migration Plan

纯前端增量。回滚 = 还原抽取 diff（NodeList 恢复内联）+ 两页接线移除。

## Open Questions

（无。）

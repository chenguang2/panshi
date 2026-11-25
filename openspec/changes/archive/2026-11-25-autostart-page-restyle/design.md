# Design

## Context

`EdgeAutostart.vue`（1255 行）现状：页面自制 `.toolbar`（分组 140 / ClusterSelect 200 / SearchInput 200 / a-select 状态 140 / 重载 a-button + v-sep + 三个 a-button 批量）；a-table 六列（`#`/集群/节点 IP/Edge 目录/自启动状态/操作）带 row-selection；状态列 antd tag（六态经 `mapAutostartStatus` 映射，失败态 outline dashed）+ `.status-meta` 小字；操作列三个 small a-button（预检禁用 + tooltip 原因）；三张抽屉（操作 560 / 批量凭据 520 / 批量进度 680）共享 `.field-block` 解剖（标题 16px/600）。设计基准 `proposal-c/edge-autostart.html` 已定稿。约束：六态映射、批量串行 SSE、预检语义、凭据契约零改动；后端零改动。

## Goals / Non-Goals

**Goals:**

- 页面渲染与设计页在 1600×1000 逐元素一致（#82 五步法验收）。
- 筛选/展示的行为等价迁移：状态下拉 → chips 行后过滤行为不变（含「未查询」= `autostart_status === null` 的精确匹配语义）。

**Non-Goals:**

- 不动六态映射文案与语义、批量串行执行、抽屉字段逻辑、分页钉位补偿逻辑（`onTableChange` scrollBy）。
- 不动设计页；后端零改动。

## Decisions

1. **工具条迁移到 `l5-toolbar` 骨架，控件改用全站口径**：分组 104 / 集群 120 / 搜索 150（#85⑥）；ClusterSelect 组件自带 100% 宽度，包一层固定宽容器；重载与批量按钮用 `.tool-btn` 族（design 页 `.tool-btn.tb-danger` 为批量禁用危险样式），弃用 a-button。备选「保留 a-button 只调宽度」被否：批量三钮 + 重载的 ghost 线稿语言是设计页主视觉差异之一。
2. **状态下拉 → chips 行**：新增 `statusCounts` computed（六态 + 全部，前端聚合 `filteredNodes` 前的全量 nodes——注意 chips 计数 SHALL 基于集群/IP 过滤前后的口径与原下拉一致：原下拉作用于 `filteredNodes` 同源数据，chips 计数按 `nodes`（集群+IP 过滤前）聚合，与节点页「计数查询不得带 publish_status 本身」同思路；点击 chip 写 `statusFilter`，过滤逻辑复用既有 `filteredNodes`。空计数 chip 加 `.empty`。备选「保留下拉」被否：#85① 单一形态。
3. **状态列胶囊**：antd `a-tag` 换为带色点的六态胶囊（色点 + 20px 高 11px/600），映射函数 `statusTag` 不动（label/outline/kind 继续来自 `mapAutostartStatus`），模板按 `statusTag(record)` 的 label + kind/outline 输出胶囊类；虚线失败态（查询受限橙 / 查询失败红）沿用 outline 语义。tooltip（七日过期 + hint + 最近操作）不动。
4. **集群列色点**：`cluster_id % 8` → `cluster-c1..c8` 类 + `.cl-dot`，集群显示名不变；复用全站 `.cl-cell/.cl-dot` 样式（style.css 已有）。
5. **页头徽标**：`PageStatBadges` items = `[{value: 去重集群数, label: '个集群'}, {value: 未配置数, label: '台未配置', tone: 'warn'}]`，均为当前 `nodes.value` 数据集聚合；组件保证首枚 accent。
6. **守卫接线**：PAGES 加 `['EdgeAutostart.vue', 'edge-autostart.html']`（徽标两侧一致自动生效）；mockupParity autostart 段三条红线——禁「全部状态」下拉回流（模板禁 `placeholder="全部状态"`）、状态 chips 行必须存在（`l5-chiprow`）、状态胶囊带色点（`.as-pill`/`.dot` 结构）。
7. **抽屉 field-block 标题 16px → 13px/600**：三张抽屉共享的 scoped 类一处改；说明行 11.5px 不变。

8. **nodes 全面对齐（2026-11-25 用户裁决 2+3+4）**：表格挂 `grid-table` 类（表头去大写/密度/悬停继承全局解剖）；分页迁外置 `ListPager`（`:pagination="false"`，组标记行不占页容量；保留 2026-10-29 的分页条钉位补偿，选择器 `.ant-pagination`→`.l5-pager`）；批量入口迁 `.l5-batchbar`（批量按钮保留 spec 的「选中优先否则筛选全量」语义——未勾选不禁用，与节点页 need-sel 禁用形态**有意不同**，差异记录于此）；分组/平铺复用 `useListClusterGrouping` + `ClusterGroupRow`（分组默认、组内 IP 数值序、平铺显集群列）；列配置复用 `useColumnConfig`/`useColumnDragColumns`/`useFitColumnWidths`（存储键 `edge_autostart`，集群列仅平铺存在不进弹窗）。
9. **「重载」→「刷新」**：TableToolbar 共享件的刷新按钮天然带「刷新」文案与 loading 旋转，接上即完成改名；读库语义靠 tooltip 与 spec 保留（`autostart-status-record` 措辞同步修订）。
10. **序号列 width 回归 45**（AGENTS #59 统一解剖；首版误写 40 被 tableAnatomy 守卫拦下）。

## Risks / Trade-offs

- [chips 计数口径与原下拉语义漂移] → 计数基于 `nodes`（仅集群+IP 已过滤的同一数据源），点击 chip 后的过滤仍走原 `filteredNodes` 逻辑；用例钉住「点 chip 后行数 = 计数」。
- [PAGES 加对后首段页头动作断言兼容性] → 设计页 `page-header-actions` 仅「操作日志」，实现 `#actions` 同款——先加对跑测试确认。
- [批量按钮弃 a-button 后 disabled 联动丢失] → 原逻辑 `:disabled="!batchTargetNodes.length || batchState.running"` 原样迁到原生按钮 `:disabled`，测试断言批量按钮禁用态保留。

## Migration Plan

单页面前端改动，一次提交，无迁移；回滚 = revert。

## Open Questions

（无）

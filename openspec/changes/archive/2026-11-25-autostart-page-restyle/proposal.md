# Proposal

## Why

自启动管理是「页面美化（proposal-c 控制台语言）」批次中尚未改版的运维列表页：工具条为页面自制形态（未挂 `l5-toolbar` 骨架与全站控件宽度口径）、状态筛选仍是下拉（filter-architecture 已在五个列表页确立「状态 = 带计数 chips」的单一形态）、状态列为 antd tag 无色点语言、集群列无色相标识。设计页 `docs/ui/Live-Artifact-5/proposal-c/edge-autostart.html` 已完成并经用户定稿（2026-11-25），本轮按设计页实施。

## What Changes

- **工具条骨架**：页面自制 `.toolbar` 迁移到全站 `l5-toolbar` 解剖——分组 104 / 集群 120 / 搜索 150（#85⑥ 同口径）、右侧簇「重载 + v-sep + 批量查询/启用/禁用」，批量按钮带勾选联动计数，批量禁用为危险样式；批量按钮留工具条（作用于筛选/勾选上下文，非页面级动作，页头动作区仅「操作日志」）。
- **状态筛选 chips 化**：「全部状态」下拉退场，改为 `.l5-chiprow` 状态行（全部/已启用/已禁用/未配置/查询受限/查询失败/未查询 七枚 chips + 前端聚合计数，空计数 chip 降透明），与五列表页单一形态对齐（#85①推广）。
- **六态状态胶囊**：antd tag → 带色点胶囊（`.pill` 家族扩展）：已启用绿实底 / 已禁用橙实底 / 未配置灰实底（中性事实非错误）/ 查询受限橙虚线 / 查询失败红虚线（失败态透明底描边与真实态分层，沿用既有 outline 语义）/ 未查询灰实底；meta 行（时间 · 最后操作）不变。
- **集群列色相**：集群名前加 6px 集群色点（`cluster_id % 8` 固定色相），对齐节点/上游页集群标识语言。
- **页头统计徽标**：`PageStatBadges` 两枚——「N 个集群」（当前数据集去重集群数，accent 首枚）+「K 台未配置」（当前数据集未配置计数，warn）。
- **抽屉 field-block 标题 16px → 13px/600**（三张抽屉共享解剖，说明行 11.5px muted 不变）。
- **nodes 全面对齐（2026-11-25 用户裁决 2+3+4）**：① 表格挂 `grid-table` 解剖类（表头去大写/9px 12px 密度/行悬停 accent 4%）；② 分页迁外置 ListPager（表格 `:pagination="false"`，保留分页条钉位补偿）；③ 批量入口迁 `.l5-batchbar` 批量条（「已选 N 项」+ 批量查询/启用/禁用（危险样式）+ 清除选择；范围语义不变：选中优先否则筛选全量）；④ 分组/平铺双视图（默认分组，组头行 = 集群名 + N 节点 + 状态分布徽章 + 勾选提示；平铺显集群色点列；全部收起/展开单按钮；复用 `useListClusterGrouping`）；⑤ 列配置个性化（显隐 + 拖宽拖序，存储键 `edge_autostart`，复用 `useColumnConfig`/`useColumnDragColumns`/`useFitColumnWidths`）；⑥ 按钮文案「重载」→「刷新」（全站一致，读库语义不变，同步修订 `autostart-status-record` spec 措辞）。
- **守卫接线**：`pageHeaderActions.source.test.ts` PAGES 加 `EdgeAutostart.vue ↔ edge-autostart.html` 对；`mockupParity.source.test.ts` 增 autostart 段源码红线。
- **零行为变更**：六态映射（`autostartStatus.ts`）、批量串行 SSE 流、预检禁用语义、凭据「仅本次使用」契约全部不动；后端零改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `edge-node-autostart`：MODIFIED「自启动管理页面」——需求正文升级为设计语言契约（工具条解剖、状态 chips 行、六态胶囊带色点与虚线失败态、集群色相列、页头统计徽标），场景标题保持稳定标识符并新增三个场景（状态 chips 筛选 / 集群列色相 / 页头统计徽标）。

## Impact

- `frontend/src/views/EdgeAutostart.vue`：模板（工具条/chips 行/状态列/集群列/页头徽标）+ scoped 样式；`<script>` 仅新增徽标与 chips 计数 computed，交互逻辑零改动。
- `frontend/src/views/__tests__/pageHeaderActions.source.test.ts`：PAGES +1 对。
- `frontend/src/views/__tests__/mockupParity.source.test.ts`：新增 autostart 段守卫（含 nodes 同构骨架红线：grid-table / ListPager / 批量条 / seg / 刷新文案）。
- `frontend/src/views/__tests__/EdgeAutostartPaging.test.ts` / `EdgeAutostartChips.test.ts`：随 ListPager 与分组视图迁移按断言反转更新（平铺钉位、handlePagerChange 驱动）。
- 后端零改动；设计页 `proposal-c/edge-autostart.html` 为验收基准（#82 五步法），本轮零修改。

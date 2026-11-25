# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `pageHeaderActions.source.test.ts` PAGES 清单加 `['EdgeAutostart.vue', 'edge-autostart.html']`，运行确认：徽标一致性断言转红（设计有 `.ph-inline` / 实现无 `PageStatBadges`）、页头动作断言「操作日志 ↔ 操作日志」通过
- [x] 1.2 `mockupParity.source.test.ts` 增 autostart 段三条红线（模板禁「全部状态」下拉回流 / 必含 `l5-chiprow` 状态行 / 状态胶囊必带色点结构），确认对现状 RED

## 2. 页头与工具条（GREEN-1）

- [x] 2.1 页头接入 `PageStatBadges`（items：去重集群数「个集群」/ 未配置数「台未配置」warn），验证 1.1 转绿；工具条迁移 `l5-toolbar` 骨架（分组 104 / 集群 120 包宽容器 / 搜索 150 / 重载 `.tool-btn` + v-sep + 批量三钮 `.tool-btn`，批量禁用危险样式），弃用工具条内 a-button

## 3. 状态 chips 行（GREEN-2）

- [x] 3.1 「全部状态」a-select 退场，新增 `.l5-chiprow` 状态行（七枚 chip + `statusCounts` 前端聚合计数，空计数 `.empty`），点击写 `statusFilter` 复用既有过滤；验证 1.2 chips 红线转绿 + 新增组件用例「点 chip 后行数 = 该态计数」

## 4. 表格解剖（GREEN-3）

- [x] 4.1 状态列 a-tag → 六态带色点胶囊（映射与 tooltip 不动；虚线失败态沿用 outline 语义），meta 行不变；集群列加 `cluster_id % 8` 色点（`.cl-cell/.cl-dot`）；抽屉 field-block 标题 16px→13px/600；验证 1.2 胶囊红线转绿

## 4b. nodes 全面对齐（2026-11-25 裁决 2+3+4，设计页重写版）

- [x] 4.7 表格挂 `grid-table` 解剖类 + `:scroll`/fixed layout（表头去大写/密度/悬停随全局）；序号列 width 回归 45（tableAnatomy 守卫）
- [x] 4.8 分页迁外置 `ListPager`（`:pagination="false"`；handlePagerChange 保留钉位补偿，选择器换 `.l5-pager`）
- [x] 4.9 批量入口迁 `.l5-batchbar`（已选 N 项 + 三批量钮（危险样式）+ 清除选择；范围语义不变、未选不禁用）
- [x] 4.10 分组/平铺双视图：`useListClusterGrouping` + `ClusterGroupRow`（分组默认、组头状态分布徽章、组头行 colSpan/勾选框隐藏、组内 IP 序）；平铺显集群色点列；全部收起/展开单按钮（分组态才显示）
- [x] 4.11 列配置个性化：`useColumnConfig`（键 `edge_autostart`）+ `useColumnDragColumns` + `useFitColumnWidths`（弹性列 Edge 目录、下限表）；列配置弹层（显隐/搜索框开关/重置列宽/拖动提示）
- [x] 4.12 「重载」→「刷新」（TableToolbar 刷新按钮）；tooltip 读库语义保留
- [x] 4.13 测试随迁：Paging 重写（flat 钉位 + handlePagerChange + `:pagination=false` 断言 + 钉位选择器 `.l5-pager`）；Chips 平铺钉位；Batch 批量条断言反转（`.b-count` 承担计数、按钮未选不禁用）；mockupParity 增 as-④⑤ 红线

## 5. 回归收口

- [x] 5.1 `npx vue-tsc -b` 通过 + 既有 `EdgeAutostart` 相关测试全绿（选择器随类名同步即按断言反转清单更新）+ 全量 `npx vitest run --maxWorkers=4`（漂移失败按 #58 隔离复跑定性）
- [x] 5.2 parity 五步法收口：双侧同数据截图 + 状态态量测（chips 行/六态胶囊/集群色点/工具条控件宽度九要素），差异清单复核全 ✓，脚本与截图存档至本变更 verification/ 目录

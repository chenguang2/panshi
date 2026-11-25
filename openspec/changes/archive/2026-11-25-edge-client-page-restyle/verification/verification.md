# edge-client-page-restyle 验收记录（2026-11-25）

基准：`docs/ui/Live-Artifact-5/proposal-c/edge-client.html`（用户已批准）。视口 1600×1000。

## parity 量测

量测脚本：本目录 `ec-parity.cjs`（九维度）。**零差异元素**：调试横幅（`ec-warn` 全维度）、tab 条（活动/非活动态色与字重，line-height 收敛后高度差 ≤0.2px）、tab 工具条、模式下拉（l5-select 130）、页头徽标（「8 类资源」accent）、表头解剖（9px 12px / --bg 底 / muted 色 35px，经资源卡挂 `table-container l5-card` 生效）。

**已解释变体**（非差异）：

- tab 高 40.2 vs 40 / tabbar 高 56 vs 52 / th 高 35.5 vs 35：亚像素与行高舍入（≤0.2px）；tabbar 4px 来自 SearchInput 组件内容高度（共享组件口径，#85⑥ 搜索 150 已对齐）。
- th 首列圆角 8px 0 0：antd 表格在圆角卡内的首列圆角，节点管理等对齐目标同款（ClickHouse 轮已登记同款变体）。

**真机状态核验**（`impl-page-entry.png` / `impl-page-query-error.png`）：进页态 = 徽标 + 调试横幅（可关闭）+ 连接条（l5-toolbar：模式 130/集群 120/节点 220/查询 primary/取消查询禁用）+ 8 Tab 条带计数角标（全 0 如实）+ grid-table 空表引导；真实查询命中不可达节点 → 错误聚合横幅 + 空态引导如实呈现（spec 既有行为）。「已连接」胶囊/ops 图标列/ID mono 为数据依赖态，由 320 绿组件测试覆盖（RouteLabel mock 断言已连接胶囊文本 + NODE 路由标注；操作列渲染随挂载用例验证）。

## 实施注记

- 8 个 `a-tab-pane` → `v-show` 内容区：实施中曾引入临时 `a-tab-pane-keep` 标记（守卫与模板有效性双重暴露），已彻底剔除并补齐 8 个 `</div>` 闭合；8 层内 `.table-container` 包裹扁平化（资源卡挂 `table-container l5-card`，ClickHouse 轮同款机理——新表头解剖的作用域要求）。
- antd 图标清理：SearchOutlined/CloseCircleOutlined/PlusOutlined/ReloadOutlined/InfoOutlined 全部内联 svg 化（仅保留 660 行在用的 WarningOutlined）。

## 测试与回归

- 守卫先行 RED→GREEN：`pageHeaderActions` PAGES +1 对（徽标先红后绿）；`mockupParity` edge-client 段 3 条红线（≥8 张 grid-table / ec-tabs 且禁 a-tabs 回流 / ec-warn + PageStatBadges）。
- 断言反转清单：`.edge-filter-bar input.form-input` → `.l5-toolbar input.form-input`（7 处）；「已连接: NODE」文案 → 胶囊+mono 形态（RouteLabel 3 例 + Ux 1 例）——批准设计的用户可见文案变更。
- `npx vue-tsc -b` 0 error；focused 321 passed（EdgeClient 三件 + 三守卫 + tableAnatomy）。
- 全量 `npx vitest run --maxWorkers=4`：失败集逐轮轮换（RouteList.scoped/StreamProxyList → AuditLog/AnsibleInventory/RelayGateways 等均未改动文件），隔离复跑全绿——按 AGENTS #58 定性波动，非回归。

## 二轮：真机缺陷修复 + 列宽拖拽接线（2026-11-25 用户实测反馈）

### Bug1 连接标注残留（根因 + 修复）

全失败分支（edge-client-ux-review-fixes 1.1）只「不设」`loadedNode` 而**不清除**——查 .13 成功后再查 .15 全失败，数据已清空但 `loadedNode`/`routeInfo` 残留 → 右簇继续显示已被清空连接的「已连接 …（经中继）」。修复：全失败分支补 `loadedNode.value = ''` + `routeInfo.value = {}`。回归钉子：新增用例「成功后查失败地址 → 旧连接标注必须消失」；全失败旧断言 `已连接:`（带冒号）在新胶囊形态下恒真，收紧为 `已连接`。

### Bug2 方法列侵占邻列（根因 + 修复）

上轮给 8 表加的 `:table-layout="'fixed'"` 严格按 edgeColumns 声明宽切列；「方法」列 a-tag 排 + 全站 td nowrap → 内容超 180px 溢出压到邻列（改版前 auto 布局按内容分配故从未暴露）。修复：固定布局保留（拖拽可靠的前提），方法单元格改 `.methods-tags` flex-wrap 容器（标签换行、不再越界）+ 本页 td `overflow: hidden; text-overflow: ellipsis`（长内容裁剪替代溢出侵占）。真机核验 routes 表 `tableLayout: fixed`、`.methods-tags` 规则在册、零报错。

### 列宽拖拽接线（设计页 th resizable 承诺补齐）

节点页同款模式 ×8 表工厂化：每表一套 `useColumnConfig`（存储键 `edge_client_<tab>`，与三列表页 `<res>_standalone` 同约定）+ `useColumnDragColumns`（tableSelector `.ec-<tab>-table`，fixedKeys index/actions）+ `resolveOrderedColumns`/`applyColumnWidths` 单点；表格恢复固定布局 + `scroll.x`（声明宽合计，拖宽严格生效）；表头接线 `th-resize-wrap`/`col-resize-handle`（`#headerCell`，index 列无把手）；重置入口 = 连接条右簇「重置列宽」（作用于当前活动 Tab，本页无列配置弹窗——与设计页的唯一偏差，已登记）。

实施坑（已排）：① `columnWiring` 初版用普通对象承载 ComputedRef → 模板不自动解包（antd 收到 ref 报 `props.columns.filter is not a function`），改 `reactive({})` 解包；② 临时 `a-tab-pane-keep` 标记残留触发守卫+模板失效，两段剔除；③ 守卫 ec-① 正则随类名组合（`ec-<tab>-table grid-table`）更新。

**拖拽全链路真机验证**：把手 5 个（6 列 − index 固定）、拖宽 263.75 → 365.2（+80 精确生效）、localStorage `edge_client_upstreams_cfg_1` 持久化、「重置列宽」还原 263.75。

### 断言反转与测试

- `.edge-filter-bar input.form-input` → `.l5-toolbar input.form-input`（7 处）；「已连接: NODE」→ 胶囊形态（4 例）
- 中继批 2 describe 缺 `setActivePinia`（`useColumnConfig → useAuthStore` 需要活动 Pinia）→ 文件级顶层 `beforeEach` 兜底
- 守卫 ec-① 正则随类名组合更新；新增 ec-②③ 红线不变
- `npx vue-tsc -b` 0 error；全量 `npx vitest run --maxWorkers=4`：**243 文件 / 3495 用例全绿**（零漂移轮）

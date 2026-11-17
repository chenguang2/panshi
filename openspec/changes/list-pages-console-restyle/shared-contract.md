# 共享层契约（list-pages-console-restyle 实现基准）

> 本文件是三条页面 lane 的对接契约。视觉基准：`docs/ui/Live-Artifact-5/proposal-c/{nodes,upstreams,routes}.html`
> 与 `theme.css` 末尾「Live-Artifact-5 增补层」段落（`.l5-*` / `.pill` / `.ps-*` / `.tg-*` / `.m-tag` / `.seg`）。
> 冲突时以本仓库既有工程约定（a-table + 列个性化 + 分页标准）为准，视觉以 mockup 为准。

## 0. 保持不变（禁止改动）

- 仍用 `a-table`：列拖拽/列宽/列序（`useColumnConfig` + `useColumnDragColumns`）与分页（`usePagination.paginationProps`）机制不变。
- 存储键分立：`node_standalone` / `upstream_standalone` / `route_standalone` 不变。
- 序号列语义（跨页连续公式、恒展示、不进勾选）不变（#59）。
- 批量 / 发布 / 删除 / 版本 / 复制 / 差异预览等既有业务流程与弹窗不变。

## 1. 工具条顺序（新规则）

从左到右：`筛选控件 → 计数 → 刷新 → 列配置 → 视图切换(分组|平铺，最右)`。
旧规则「列配置必须紧贴筛选控件、不得被推到工具条右端」自本变更起**作废**。

落实为 `components/TableToolbar.vue`（新），三页共用：

```
props:
  count: number|string          计数数值（必填）
  countUnit: string             计数单位，如 '个节点' / '个上游' / '条路由'
  refreshing?: boolean          刷新按钮 loading
  showMode?: boolean            是否渲染视图切换（默认 true）
  mode?: 'group'|'flat'         v-model:mode
emits: refresh；update:mode
slots: #filters（筛选控件，左）  #config（列配置触发器，右）
DOM 契约（测试选择器）:
  [data-test="toolbar"]  [data-test="toolbar-count"]  [data-test="toolbar-refresh"]
  [data-test="view-mode-group"]  [data-test="view-mode-flat"]（.seg-opt / .seg-opt.active）
样式: .l5-toolbar / .l5-count / .tool-btn / .seg / .seg-opt（全局 style.css）
```

## 2. 分组逻辑（`composables/useListClusterGrouping.ts`，新）

```ts
export interface ClusterGroupChip { label: string; tone?: 'ok' | 'warn' | 'bad' }
export interface GroupHeaderRow { __groupHeader: true; key: string; groupKey: string; label: string; chips: ClusterGroupChip[]; folded: boolean }
export function isGroupHeaderRow(r: unknown): r is GroupHeaderRow
export function useListClusterGrouping<T extends { cluster_id?: number | null; cluster_name?: string | null }>(options: {
  rows: () => T[]                       // 当前页已筛选数据
  chips?: (rows: T[]) => ClusterGroupChip[]   // 域内统计徽章（数量徽章由 composable 自动加在最前）
  unit: string                          // '节点' | '上游' | '路由' → 数量徽章 `${n} ${unit}`
  mode?: Ref<'group' | 'flat'>          // 缺省内部自建
})
→ { mode, displayRows, groups, foldedKeys, toggleFold, isRowSelectable }
```

- 分组键 = `cluster_id`；`cluster_id` 为空 → 归入「未关联集群」（groupKey `__none__`）。
- 组顺序 = 数据中首次出现顺序（不重排，与后端序一致）；组内保持原序。
- `displayRows`：平铺 = 原数组；分组 = `header + rows`（该组折叠则只有 header）。
- header 行**不可选中、不可排序**；`isRowSelectable(row)` 供 `row-selection.getCheckboxProps` 使用。
- 折叠状态按 `groupKey` 存于 `foldedKeys`（Set），切模式不丢（切回分组仍折叠）。
- 单组也渲染 header（与多组一致，避免两套解剖）。

## 3. 排序与模式的互斥

- 仅「平铺」可排序。分组模式下页面把列定义里的 `sorter` 置 false，并在可排序列 th 上挂 `customHeaderCell` → `onClick` 触发**一次性提示**（`components/ListHintBar.vue` 或页面内 `showSortLockedHint()`，文案：`分组模式下不可排序，切换「平铺」后可按表头排序`），不持久横幅、不改排序状态。
- 排序键跨模式保留：模式切换**不清空** `sortBy` / `sortOrder`；回到平铺时按状态还原表头排序 UI（列定义写回 `sortOrder`）。
- 平铺模式 `displayRows` 为原数组，`row-selection` 行为与改造前一致。

## 4. 页头统计徽章

`PageHeader.vue` 新增可选 `#stats` slot（渲染在标题行内、标题右侧），默认不渲染 → 其它页零影响。徽章渲染用 `components/PageStatBadges.vue`：

```
props: items: { value: number|string; label: string; tone?: 'accent'|'ok'|'warn'|'bad' }[]
DOM: [data-test="page-stat"]（首个为 .ph-lite.lite-accent 主统计）
```
数据取自当前页已加载数据（`items`），不做额外请求。

## 5. 集群列移除

三页从列定义（`columns`）与列配置弹窗清单（`popoverColumns`）中移除「所属集群」；集群信息由组标记行承载。
**列宽/列序存储兼容**：`useColumnConfig` 的 `allColumns` 传入「当前全量列键」；旧存储里的 `cluster_name` 由 `resolveOrderedColumns` 的未知键裁剪天然忽略，不需迁移。
注意 `setColumnOrder` 的清洗必须按 `allColumns`（全量列键）而非默认可见列（#79 route-column-reorder-fix），否则非默认列会被钉死在操作列右侧。

## 6. 状态语言（共享组件视觉升级）

- `components/BadgeStatus.vue`：改为胶囊（`.pill` 解剖：圆点 + 文案，`border-radius:999px`，`font-size:11px`，`font-weight:600`，`padding:0 8px`），状态色沿用 `--success/--danger/--warning/--muted`；`text`/`status` 契约不变（其它消费方零改动，只换观感）。
- `components/PublishStatusTag.vue`：`.ps-*` 改为胶囊（`.ps-tag` 圆角 999px、11px/600）；文案与四态判定逻辑不变（已发布=版本号+时间、待发布、未发布、部分失败）。**不动判定顺序**（publish-status-unify 2026-11-13 裁决）。

## 7. 数据形态（2026-11-16 curl 实测，禁止臆造）

- `GET /upstreams`：`targets: [{ target: "1.1.1.1:80", weight: 100 }]` —— **无任何健康字段**。
  → 目标列退化渲染：`地址:端口 · 权重 N` 单行 chips（`.tg-chip`，无圆点、无健康条、无「N 目标 · 全部健康」汇总行）。
- `GET /routes`：`methods` 为逗号串（`"GET,POST,..."`）、`priority` 整数、`upstream_name`、`created_at` naive、`pending_publish` / `current_version` / `published_at` / `last_publish_status` 四态齐备。
- `GET /nodes`：**无** `edge_version` / 发布字段（当前页 Edge 版本列另有来源，改造时保持原来源不变）；`status` 0/1 + `status_detail`。

## 8. 样式落位

`.l5-*` / `.seg` / `.pill` / `.ps-*` / `.tg-*` / `.m-tag` / `.empty5` / `.ph-lite` / `.ph-inline` / `.lb-chip` / `.scheme-chip` / `.path-stack` / `.pipe-*` / `.prio` / `.ops` / `.op-*` / `.l5-group*` / `.g-*` / `.sort-ind` / `.l5-hintbar` 统一追加到 `src/style.css` 末尾新增「列表页控制台层」段落（与 `.card-grid` 同范式：全局单点，页面不重复声明）。

## 9. 测试范式

- 组件测试挂 a-table 用 `src/views/__tests__/helpers/aTableStub.ts` 桩（jsdom 无 matchMedia）。
- 需要 `document.querySelector` 的用例必须 `mount(attachTo: document.body)` 并在结尾 `wrapper.unmount()`（#43）。
- 组标记行的 `colspan` 行为无法在 jsdom 校验布局，用 `customCell` 返回 `{ colspan }` 的结构断言 + 真机 Playwright 截图验收。

## 10. 裁决补充（2026-11-16，Orchestrator 定案，先于三条页面 lane）

新增内容以本节为准；与上文冲突时以本节为准。

### 10.1 合并列的实现键（断言反转清单 §8-3 待裁决项）

| 页 | 合并列标题 | 列 key / `data-col` | 承载的可见性开关 |
|---|---|---|---|
| 节点 | `安装路径` | `edge_path`（固定） | `edge_path`（Edge 行）、`openresty_path`（OR 行） |
| 路由 | `请求匹配` | `uri`（固定） | `uri`（URI 本体）、`methods`（方法 chips） |

- 合并列**只有一个 DOM 列、一个拖拽柄、一个 `data-col`**（节点页列数 10→8、拖拽柄 9→7）。
- 被吞并的键（`openresty_path` / `methods`）**保留在列配置勾选项与 localStorage 里**，只是不再单独成列：其勾选状态只控制合并列内部某一行/某一段的显隐。
- 两者都未勾选时合并列整列不渲染（等同现状两列都隐藏）。节点页仅勾 `openresty_path` 时合并列仍以 `edge_path` 为键渲染（单行 OR 路径）。
- 列序定位：合并列落在主键在 `order` 中的位置；主键被隐藏时落在被吞并键的位置（`resolveOrderedColumns` 的槽位填充已保证，勿另写定位逻辑）。

### 10.2 视图模式的默认值与测试钉法（断言反转清单 §F2）

- 生产默认 = **分组**（`mode` 初值 `'group'`，不读写 localStorage，不跨会话记忆）。
- 页面 `defineExpose` 暴露 `viewMode`（组合式的 `mode` ref），组件测试用 `;(wrapper.vm as any).viewMode = 'flat'` 钉住平铺场景，**不要**为了让旧用例过而把默认值改成 flat。
- 三页测试的 `a-table` 桩必须**分流渲染**：组标记行渲染为 `<tr data-test="group-header">`（**不带** `ant-table-row` 类、不带 `td`），数据行保持 `<tr class="ant-table-row">`。这样既有「`tr.ant-table-row` 计数 / `findAll('td')[n]` 下标」断言在分组模式下自动零影响；仅 `findAll('tbody tr')` 这类全量计数断言需改为 `tr.ant-table-row`（清单 §1.2-① 已定位仅 1 处：`NodeList.test.ts:346`）。
- **生产环境口径补充（真机验收期实测）**：真实 a-table 会给所有 body 行（含组头行）加自带 `ant-table-row` 类，customRow 的 `l5-group-row` 是**追加类**——生产 DOM 里区分组头用 `tr.l5-group-row`（或 ClusterGroupRow 的 data-test="cluster-group-row"），勿按测试桩的「组头无 ant-table-row 类」反推生产选择器。
- 三页 `PageHeader` 测试桩补 `<slot name="stats" />`（否则页头徽标断言不可见）。

### 10.3 组头统计芯片口径（与行内徽章同源，规格 list-page-cluster-grouping）

- 节点：`N 节点` + `运行中` + `已停止` + `未检测`（为 0 时不渲染）。
- 路由：`N 路由` + `已发布` + `待发布` + `部分失败`（为 0 时不渲染）。
- 上游：`N 上游` + `已发布` + `待发布`（为 0 时不渲染）。
- 页头徽标（全局同口径）：节点「N 节点 · 运行中 · 已停止 · 未检测」；路由「N 路由 · 已发布 · 待发布 · 未发布」；上游「N 上游 · 已发布 · 待发布 · 部分失败」。
- 判定必须复用页面里**行内徽章已有的**判定函数/字段（同源），不得在组头另写一套条件；页头数字取「当前筛选数据集」，组头取「当页组内」（非集群全量）。

### 10.4 组内固定序与行号

- 组内固定序由页面传入 `sortWithinGroup`：节点 `compareNodeIp`、上游 `compareUpstreamName`、路由 `compareRoutePriority`（`utils/listGroupSorters.ts` 已落地并有用例）。
- 行号 `#` 用组合式的 `sequenceOf(row)`（渲染序 1 基，跳过组标记行），跨页偏移沿用 `(page-1)*pageSize+`。
- 平铺模式不使用 `sortWithinGroup`（= 服务端默认序或用户排序）。

### 10.5 排序拦截与「清除排序」

- 分组模式下可排序列（路由 `name`/`uri`/`priority`/`created_at`）列定义 `sorter` 置 `false`，并接管 `#headerCell` 点击弹一次性提示；平铺模式写回 `sorter: true` 与 `sortOrder`。
- 「清除排序」为路由页工具条簇内次要文字按钮，**仅平铺且 `sortBy` 非空**时可见；点击只清 `sortBy/sortOrder` 并重载数据，不切模式。
- 节点页与上游页**无任何可排序列**（规格明示不发明生产没有的能力），其 `#headerCell` 不挂排序拦截提示。

### 10.6 a-table 组标记行的技术实现（禁止另造表格）

- 组标记行经 `:custom-row`（判定 `isGroupHeaderRow`）加 `class="l5-group-row"`；首列 `customCell` 返回 `{ colSpan: 可见列数 }`，其余列 `customCell` 返回 `{ class: 'l5-group-cell-hidden' }`；`style.css` 里 `.l5-group-row > td.l5-group-cell-hidden { display: none }`。
- 组标记行内容由 `components/ClusterGroupRow.vue` 渲染（折叠箭头 + 组名 + 芯片），点击整行切换折叠；`row-selection.getCheckboxProps` 用 `isGroupHeaderRow` 返回 `{ disabled: true }`。
- 若 `fixed: 'left'/'right'` 与 colSpan 冲突（首列 `fixed` 时 sticky 计算会破坏整行宽度），**分组模式下不传 `fixed`**（平铺模式保留原状）；以真机截图为准，jsdom 只断结构。

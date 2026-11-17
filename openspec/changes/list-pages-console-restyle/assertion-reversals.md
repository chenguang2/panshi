# 断言反转清单（list-pages-console-restyle）

> 对应 `tasks.md` 1.1（约定 #217：改共享层/页面解剖前先产出断言反转清单）。
> 盘点时间：2026-11-16；范围：`frontend/src/**/__tests__/` + `frontend/e2e/`；方法：候选串 grep → 逐文件读断言原文。
> 依据规格：`proposal.md`、`design.md`、`shared-contract.md`、`specs/{table-toolbar-ux,list-page-cluster-grouping,list-page-header-stats,table-sorting,node-management}`。

## ⚠️ 开工前必读（两条现场事实，影响全部估算）

**F1（并行 WIP，约定 #71）**：`git status` 显示以下文件已被另一会话产出（未跟踪，2026-11-16 13:49）：
- `frontend/src/composables/useListClusterGrouping.ts`（6.2 KB，已导出 `useListClusterGrouping` / `isGroupHeaderRow` / `UNGROUPED_KEY` / `UNGROUPED_LABEL`）
- `frontend/src/composables/__tests__/useListClusterGrouping.test.ts`（167 行，11 个用例，覆盖分组键/兜底组/组序/数量徽章/折叠跨模式/标记行不可选不占行号/组内固定序/单组也渲染/数据源重算/受控 mode/computed 源）
- `openspec/changes/list-pages-console-restyle/shared-contract.md`

→ tasks 2.1/2.2 的分组组合式**已基本落地**，本清单 §4.8 的「新增」仅指**页面接线断言**（四步主流程、徽标一致性、组头行渲染），不要重复写组合式语义用例。`TableToolbar.vue` / `PageStatBadges.vue` **尚不存在**（已 `ls` 确认）。

**F2（机制性风险，最高优先级）**：三个页面组件测试都用**直接遍历 `dataSource` 的 a-table 桩**，且新默认视图是「分组」。分组模式把组头标记行注入 dataSource（`displayRows = header + rows`）后，**所有按行计数的既有断言会整体位移**，且桩以 `:key="r.id"` 迭代、组头行无 `id` → Vue 重复 key 警告。已定位的四处硬计数见 §1.2-①/§2.2-①/§3.2-①，必须在接线时同步处理（推荐：`mountPage()` 默认钉 `mode='flat'`，分组态单独起用例；或桩过滤 `__groupHeader` 行）。

## 汇总

受影响测试文件 **9** 个，其中 反转 **6** / 删除 **0**（整文件级；删除动作全部发生在条目级，见各表「删除」行）/ 新增 **3**；另有 **13** 个「待核」文件（取决于实现细节或真机行为，见 §7.1）、**16** 个文件已逐个确认不受影响（§7.2）。

| 处置 | 文件 |
|---|---|
| 反转 6 | `views/__tests__/NodeList.test.ts`、`views/__tests__/UpstreamList.test.ts`、`views/__tests__/RouteList.test.ts`、`views/__tests__/uxReviewL.source.test.ts`、`views/__tests__/NodeList.source.test.ts`、`e2e/route.spec.ts` |
| 新增 3 | `components/__tests__/TableToolbar.test.ts`（新）、`components/__tests__/PageStatBadges.test.ts`（新）、三页新增「分组/平铺四步流程」用例组（落在各自页面测试文件内，共 3 处） |
| 待核 13 | 见 §7.1（BadgeStatus/ClusterNodes/NodeHealthCard/Dashboard/ClusterTerminology/PublishDiffButton.consumers/ClusterSelect.consumers/uxReviewM.source + 5 个 e2e） |
| 不受影响 16 | 见 §7.2 |

条目级统计：**既有断言需改或删 26 条**（反转 17 / 删除 9），**需补新断言 19 条**。

---

## 0. 逐页现状（列定义与工具条原文，作为后续 diff 基线）

### 0.1 `frontend/src/views/NodeList.vue`

```ts
// NodeList.vue:866-881
// batch2 3.2 / D6：移除全部列客户端排序——当前页字符串比较序是错的（IP 数值序被打乱），
// 后端 GET /nodes 已全量数值 IP 排序；≤100 节点规模下当前页排序无价值且误导。不做表头排序 UI 替代。
const columns: TableColumnsType = [
  { title: '#', key: 'index', width: 45, fixed: 'left' },
  { title: 'IP', dataIndex: 'ip', key: 'ip', width: 140, fixed: 'left' },
  { title: '所属集群', dataIndex: 'cluster_name', key: 'cluster_name', width: 140 },   // ← 删
  { title: '服务端口', key: 'service_port', width: 100 },
  { title: '管理端口', key: 'management_port', width: 100 },
  { title: 'Edge 安装路径', key: 'edge_path', width: 220 },        // ← 与下一列合并为「安装路径」
  { title: 'OpenResty 安装路径', key: 'openresty_path', width: 220 }, // ← 合并（键保留）
  { title: '状态', key: 'status', width: 120 },
  { title: 'Edge 版本', key: 'edge_version', width: 110 },
  { title: '操作', key: 'actions', width: 320, fixed: 'right' },
]
```
- 存储键：`NodeList.vue:898-903` `useColumnConfig({ key: 'node_standalone', … })`；行内动作键 `NODE_ROW_ACTION_KEYS = ['start','stop','status']`（:887）。
- 列序：`NodeList.vue:906+` 本地 `orderedColumns` computed（尚未用共享 `resolveOrderedColumns`——本变更窗口内若顺手统一，注意 §4.5 的 `allColumns` 契约）。
- 工具条：`.node-filter-bar`（源码守卫钉 `flex-wrap: wrap`，见 §5）；当前无「共 N 个节点」工具条计数（计数在「筛出 X 个」里）。

### 0.2 `frontend/src/views/UpstreamList.vue`

```ts
// UpstreamList.vue:270-279
const columns: TableColumnsType = [
  { title: '#', key: 'index', width: 45, fixed: 'left' },
  { title: '名称', dataIndex: 'name', key: 'name', width: 140, fixed: 'left' },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name', width: 140 },  // ← 删
  { title: '负载均衡', key: 'load_balance', width: 120 },
  { title: '目标节点', key: 'targets', width: 220 },   // ← 改名「目标节点与健康」，退化 chip 渲染
  { title: '协议', key: 'scheme', width: 90 },
  { title: '发布状态', key: 'publish_status', width: 160 },
  { title: '操作', key: 'actions', width: 150, fixed: 'right' },
]
```
- 存储键：`UpstreamList.vue:291` `useColumnConfig({ key: 'upstream_standalone', … })`；列序已走 `resolveOrderedColumns`（:294）。
- 工具条现状：`:12` 计数 `共 {{ ... }} 个上游`（文本），`:18` 「列配置」按钮，`:9` `.page-toolbar` 容器，`:23` 「+ 添加上游」。

### 0.3 `frontend/src/views/RouteList.vue`

```ts
// RouteList.vue:365-389
const columns: TableColumnsType = [
  { title: '#', key: 'index', width: 45, fixed: 'left' },
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true, width: 140, fixed: 'left' },
  { title: 'URI', key: 'uri', sorter: true, width: 220 },          // ← 与「方法」合并为「请求匹配」
  { title: '方法', key: 'methods', width: 110 },                    // ← 并入上一列（键保留）
  { title: '上游', key: 'upstream', width: 160 },                   // ← 改 chip 列
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name', width: 140 }, // ← 删
  { title: '优先级', key: 'priority', sorter: true, width: 90 },     // ← 改 mono 徽章列
  { title: '发布状态', key: 'publish_status', width: 200 },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', sorter: true, width: 160 },
  { title: '操作', key: 'actions', width: 110, fixed: 'right' },
]
```
- 存储键：`RouteList.vue:401` `useColumnConfig({ key: 'route_standalone', … })`；列序 `resolveOrderedColumns`（:404）。
- 方法 chips 行现状：`:10-19`（`div.filter-chips` + `button.filter-chip`，含「全部」+ 各方法），**在表卡之外的独立行**。
- 计数现状：`:87` `<div class="route-count">共 {{ total }} 条路由</div>`（在 `.route-filter-bar` 内）。
- 列表：`:90` `<a-table class="route-table grid-table" … :scroll="{ x: 'max-content' }" :table-layout="'fixed'">`；`:103-112` `#headerCell` → `useColumnDragColumns`；`:113-127` `#bodyCell`（含 `.dns-route-badge`）。
- 列配置弹窗：`:65-86`（含「显示字段」勾选组、「显示搜索框」开关、提示行、「重置列宽」）。

---

## 1. 节点管理页（NodeList.vue）

### 1.1 `frontend/src/views/__tests__/NodeList.test.ts`

| # | 测试标题（原文） | 现有断言（行号 + 原文） | 处置 | 新断言要点 |
|---|---|---|---|---|
| 1-① | `双计数收敛：未筛选时筛选栏无计数，状态筛选时显示「筛出 X 个」（2.5）` | `:569` `expect(bar.text()).not.toContain('个节点')`；`:578` `expect(wrapper.text()).toContain('筛出 1 个')` | **反转** | 未筛选态新工具条计数「共 N 个节点」必然含「个节点」→ 断言改为「`.node-filter-bar` 内不含计数，计数在 `[data-test="toolbar-count"]`」；`:578` 保留 |
| 1-② | `翻页到第 3 页请求携带 page=3 并渲染当页行` | `:346` `expect(wrapper.findAll('tbody tr').length).toBe(2)` | **反转** | 默认分组：2 节点同集群 → 3 行（1 组头 + 2 数据）。改钉 `mode='flat'`（或桩过滤组头）后保持 2，并新增分组态 3 行用例 |
| 1-③ | `表格横向滚动 + fixed 布局；全列默认宽；#与IP固定左、操作固定右`（node-list-column-resize） | `:1545` `expect(wrapper.find('.node-table').classes()).toContain('grid-table')`；`:1548-1551` 全列 `width > 0`、`index`/`ip` fixed left、`actions` fixed right | **反转（部分）** | 列数 10→8；合并列「安装路径」必须仍有数值 `width`；`cluster_name` 从断言中删除 |
| 1-④ | `拖拽柄：非 # 列表头右缘存在，「#」列无` | `:1559` `expect(handles.length).toBe(9) // 10 列 - index` | **反转** | 新列数 8（去集群列、并两路径列）→ `toBe(7)`；注释同步改写 |
| 1-⑤ | `拖拽调宽：mousedown+mousemove 实时生效…` | `:1571` 起，含 `colWidth('edge_path')).toBe(220)` 与 `th[data-col="edge_path"] .th-resize-wrap` 手势 | **反转（待定键）** | 需先裁决合并列的实现键：建议合并列沿用 `edge_path` 作 `data-col`/列 key（`openresty_path` 仅作可见性开关），否则本用例与 1-⑥ 全部要改 `data-col` 选择器 |
| 1-⑥ | `真实拖拽序列（位移→mouseup…）实时换位 / Esc 取消 / 固定列豁免`（含 `DEFAULT_SEQ` / `LIVE_SEQ`） | `:1665-1676` `DEFAULT_SEQ = ['index','ip','cluster_name','service_port','management_port','openresty_path','edge_path','status','edge_version','actions']`；`:1687` `LIVE_SEQ`；`:1698` `expect(JSON.parse(localStorage.getItem('node_standalone_cfg_guest') ?? '{}').order).toEqual(LIVE_SEQ)`；`:1706-1717` 第二次拖拽后的序列数组；`:1721-1729` IP 固定列豁免 | **删除 + 反转（整段重写）** | 删 `cluster_name`；两路径列合并为一列后几何坐标（`clientX: 550/720/650/340`）与相邻关系全部失效 → 按新 8 列重算矩形；持久化断言保留（键名 `node_standalone_cfg_*` 不变） |
| 1-⑦ | `adds a new node`（batch2 刷新按钮）描述块 `:805-829` | `:816` `const btn = wrapper.findAll('button').find(b => b.text().includes('刷新'))`；`:820-826` 点击后 `lastParams().page === 1` 且请求数 +1 | **不受影响（约束）** | 新工具条 `[data-test="toolbar-refresh"]` 必须仍是 `<button>` 且文案含「刷新」，否则本用例定位失败；建议改为 `data-test` 选择器 |
| 1-⑧ | `列选择驱动 visibleNodeColumns 并持久化到 node_standalone_cfg_*` | `:1505-1520` `vm.nodeColumnsSelected = ['ip','actions']` → 期望 `['index','ip','actions']` | **不受影响** | 不涉集群列；若合并列引入独立可见性键需另补「仅 `openresty_path` 未勾选时…」用例 |
| 1-⑨ | `独立 storage key「node_standalone」，与 Tab 的 node 配置互不影响（D8 源码守卫）` | `:1452` `expect(s).toContain("key: 'node_standalone'")` | **不受影响** | 存储键禁止改名 |
| 1-⑩ | 状态徽章三态（`.badge-status` / `badge-online` / `badge-offline` / `badge-neutral`）多处 | 例：`:658+` 区域 `expect(...classes()).toContain('badge-online')` | **待核** | 取决于 `BadgeStatus.vue` 是否保留 `.status-dot` / `.badge-*` 类名（见 §4.1） |
| 1-⑪ | — | 新增 | **新增** | ①组头标记行渲染（`colspan`/组名/数量徽章）；②切换器默认「分组」且 `data-test="view-mode-group"` 带 `.active`；③四步流程：切平铺→排序→切分组→回平铺恢复排序（节点页无可排序列，此步以 `sortBy` 状态保留断言替代或标注 N/A）；④页头徽标数字 = `total` = 工具条计数 |

### 1.2 `frontend/src/views/__tests__/NodeList.source.test.ts`（源码守卫，正则解析 `NodeList.vue`）

| # | 测试标题（原文） | 现有断言（行号 + 原文） | 处置 | 新断言要点 |
|---|---|---|---|---|
| 2-① | `表格状态列可见节点禁用态（已禁用徽章，与 nginx 运行态并存）` | `:26` `const block = s.match(/column\.key === 'status'[\s\S]{0,1200}?<\/template>/)`；`:28` `expect(block![0]).toMatch(/record\.status === 0[\s\S]{0,200}已禁用/)` | **待核（窗口脆弱）** | 重排版/胶囊化后 status 列模板若变长超 1200 字符即静默失败 → 建议放宽到 2000 或改断 `data-col="status"` |
| 2-② | `columns 零客户端 sorter（当前页 localeCompare 字符串序是错的…）` | `:33-38` `expect(s).not.toMatch(/sorter:\s*\(/)`、`not.toContain('sorter: true')`、`not.toContain('localeCompare')` | **不受影响（硬约束）** | 节点页**禁止**引入 `sorter: true`——与「仅平铺可排序」不冲突（节点页本就无可排序列） |
| 2-③ | `筛选栏允许换行（nowrap→wrap）` | `:126` `s.match(/\.node-filter-bar \{[\s\S]*?\}/)`；`:128` `expect(block![0]).toContain('flex-wrap: wrap')` | **反转向风险** | 若 `.node-filter-bar` 被新工具条替换/改名，本守卫即红。裁决：保留类名与 `flex-wrap: wrap`，或改断新工具条容器类 |
| 2-④ | `emoji 操作图标换 AntDV 图标组件（🔍/▶/⏹/⟳/⋯）` | `:113-122` 无 emoji + 含 `PlayCircleOutlined`/`PauseCircleOutlined`/`ReloadOutlined`/`MoreOutlined` + `toContain('SearchInput')` | **不受影响（约束）** | 新工具条图标一律 AntDV 图标，不得回潮 emoji；`SearchInput` 组件引用必须保留 |
| 2-⑤ | `confirmState/executeConfirm/手写确认模板零残留…` 等 batch1/batch2/batch3 守卫（:42-152） | 删除/启动停止文案、`showDangerConfirm`、`executeDeleteWithProgress`、SSE `appendStreamLine`、`execDrawerMode` | **不受影响** | 重排版不得改动这些流程标识符 |

---

## 2. 上游管理页（UpstreamList.vue）

### 2.1 `frontend/src/views/__tests__/UpstreamList.test.ts`

| # | 测试标题（原文） | 现有断言（行号 + 原文） | 处置 | 新断言要点 |
|---|---|---|---|---|
| 1-① | `列集合与列宽…`（列定义整表断言） | `:193` `expect(cols.map((c) => c.title)).toEqual(['#','名称','集群','负载均衡','目标节点','协议','发布状态','操作'])` | **删除（集群列）+ 反转（目标列改名）** | 新期望：`['#','名称','负载均衡','目标节点与健康','协议','发布状态','操作']`（7 列） |
| 1-② | `移除全部前端 sorter` | `:196-203`（断言列定义零 `sorter`） | **不受影响** | 上游页保持零排序能力（规格明示「SHALL NOT 发明生产没有的排序能力」） |
| 1-③ | 发布状态四态行渲染（`PublishStatusTag` 五态用例） | `:265-276` `const rows = wrapper.findAll('tr.ant-table-row')`；`:270` `expect(rows).toHaveLength(5)`；`:271-276` `rows[0].text()` 含 `v3` / `待发布` / `未发布` / `发布未完全生效` | **反转** | 默认分组 → 行数 5→6（1 组头 + 5）且索引整体 +1；须钉 `mode='flat'` 或按「数据行」过滤组头 |
| 1-④ | 分页（服务端 20/页） | `:598-599` `const rows = wrapper.findAll('tr.ant-table-row')` / `expect(rows.length).toBe(20)`；`:607-609` 第 2 页 `expect(rows2.length).toBe(5)`、`rows2[0].findAll('td')[1].text()).toBe('21')` | **反转** | 组头随页变化 → 20 变 21+N（N=当页集群数），第 2 页同理；且 `td[1]` 下标受「集群列删除」影响需重算 |
| 1-⑤ | 工具条计数字面量 | 页面 `:12` 渲染 `共 N 个上游`；测试用例断言该 span 文本 | **反转** | 计数迁到 `[data-test="toolbar-count"]`，文案口径由规格定（`共 N 个上游`）；断言同步换选择器 |
| 1-⑥ | 行内发布按钮样式归一（方案 A：primary → 次级） | `:316-331` `wrapper.findAll('button')` 过滤「发布」→ `expect(pubBtns).toHaveLength(2)` | **待核** | 若组头行渲染了按钮（折叠/统计）会误入集合；建议断言限定 `tr.ant-table-row` 内 |
| 1-⑦ | `搜索框在工具条内` / 上/下一页文案等 | 见文件内 `:105` 等既有断言 | **不受影响** | 搜索框留在 `#filters` 槽 |
| 1-⑧ | — | 新增 | **新增** | ①刷新按钮存在且点击重新拉列表、**不重置**筛选/排序/模式（tasks 4.3）；②「目标节点与健康」列按真实形状渲染（`targets:[{target,weight}]` → `.tg-chip`「地址:端口 · 权重 N」，**禁止**臆造健康字段，见 shared-contract §7）；③页头徽标；④四步流程（上游无可排序列 → 排序步 N/A） |

---

## 3. 路由管理页（RouteList.vue）

### 3.1 `frontend/src/views/__tests__/RouteList.test.ts`

| # | 测试标题（原文） | 现有断言（行号 + 原文） | 处置 | 新断言要点 |
|---|---|---|---|---|
| 1-① | 方法 chips 行 + 计数（`方法筛选` 描述块） | `:281` `expect(page.text()).toContain('共 3 条路由')`；`:282` `expect(page.findAll('.filter-chip').length).toBeGreaterThan(1)`；`:284-296` 点 `筛选 GET` → `lastParams().method === 'GET'` | **反转** | 计数移到 chips 行右端（仍是 chips 行文本，断言可保留）；chips 行 DOM 从「独立行」迁入表卡内 `directly above thead` → `.filter-chip` 选择器保留即可，但需补「chips 行位于 `.route-table` 卡片内、表头之上」的结构断言 |
| 1-② | 分页行数 | `:333` `expect(rows(wrapper).length).toBe(20)` | **反转** | 默认分组 → 20 变 20+N 组头；钉 `mode='flat'` 或过滤组头 |
| 1-③ | `列定义：可排序收敛 name/uri/priority/created_at（sorter: true），集群/上游/状态列无本地 sorter` | `:560-572`：`byKey('name')?.sorter === true`、`uri`/`priority`/`created_at` 同；`:569` `expect(byKey('cluster_name')?.sorter).toBeUndefined()`；`:568` `upstream`、`:570` `publish_status` 无 sorter | **删除（cluster_name 项）+ 反转（sorter 生效条件）** | 删 `cluster_name` 行；`sorter` 改为「仅平铺生效」：分组模式列定义 `sorter` 置 false（shared-contract §3）→ 原 4 个 `toBe(true)` 断言需带 `mode='flat'` 前置；补分组态「四列 `sorter` 全 false + 表头点击弹一次性提示」 |
| 1-④ | `列宽：发布状态定宽 200…、操作列 110…` | `:574-581` `byKey('publish_status')?.width === 200`、`byKey('actions')?.width === 110` | **不受影响** | 两列宽度保留（视觉层可再调，改则同步） |
| 1-⑤ | `表头排序透传服务端参数：ascend→sort_by=name&sort_order=asc；descend→desc` + `取消排序（第三态）` | `:583-601` 经 `button.mock-sort` 触发 `change` | **反转向风险** | 若页面在分组模式忽略 `change`（拦截提示），这两个用例在默认分组下会红 → 需前置切平铺；`:594-601` 三态清除逻辑保留 |
| 1-⑥ | `白名单外字段（cluster_name，本地 sorter 已移除）即使误发也不产生排序参数（值域守卫）` | `:603-607` 点 `sort-cluster-asc` → `sort_by` undefined | **删除/改写** | 集群列已不存在，用例改指另一非白名单键（或保留为纯值域守卫并改标题文案） |
| 1-⑦ | 固定列 + grid-table + 列宽基线（`colDragTable` 描述块） | `:1455-1456` `scroll === { x: 'max-content' }`、`tableLayout === 'fixed'`；`:1459-1461` `index(45,left)`/`name(140,left)`/`actions(110,right)`；`:1462` `.route-table` 含 `grid-table` | **不受影响（硬约束）** | 重排版必须**保留** `.route-table` / `grid-table` / `scroll` / `table-layout: fixed` 四件套（table-anatomy + 列宽/列序机制的前提） |
| 1-⑧ | `拖拽移动实时换位；拖后点击不触发排序（sorter 手势冲突抑制）` | `:1466-1492` `th[data-col="uri"]` + `th[data-col="priority"]`；`:1483` `expect(seq.indexOf('uri')).toBe(seq.indexOf('priority') - 1)` | **反转（键/几何）** | URI 与方法合并为「请求匹配」列后，`data-col="uri"` 是否存在取决于合并列键（建议保留 `uri`）；相邻几何坐标（`350→620`）按新列序重算 |
| 1-⑨ | `真实拖拽序列（位移→mouseup→补发 click）不触发排序；纯点击不受拦截` | `:1494+` 同 `data-col="uri"` 手势 | **待核** | 同 1-⑧ |
| 1-⑩ | — | 新增 | **新增** | ①两行工具条结构：chips 行贴表头（计数右置）+ 筛选行右端簇**不含**计数；②L2 列改造：优先级 mono 徽章列、上游 chip 列、`methods`+`uri` 合并列（取消勾选 `methods` 时只渲染 URI）；③平铺限定排序四步主流程 + 分组模式表头点击一次性提示（不持久横幅、不改排序状态）；④刷新按钮语义；⑤DNS 路由特殊行（行内操作禁用态 + 指路 tooltip）行为不变 |

### 3.2 `frontend/src/views/__tests__/RouteListClusterId.test.ts`

**不受影响**：仅断言深链 `?cluster_id=` 预选与 `GET /routes` 的 `cluster_id` 参数（读 `:100-118` 全文件，无列/工具条/计数断言）。分组键用 `cluster_id`，深链行为不变。

### 3.3 `frontend/src/views/__tests__/uxReviewM.source.test.ts`（M 批次守卫，含 2 条解析这两页的用例）

| # | 测试标题（原文） | 现有断言（行号 + 原文） | 处置 | 新断言要点 |
|---|---|---|---|---|
| 3-① | `M9 路由方法徽章超过 3 个收敛` / `方法徽章渲染 slice(0, 3) + 溢出计数` | `:89-91` `expect(s).toContain('slice(0, 3)')`；`expect(s).toContain('method-more')` | **待核（易静默失效）** | 方法 chips 迁移到「请求匹配」列后必须仍保留 `slice(0, 3)` 与 `method-more` 类名，否则守卫红；若有意改收敛形态，需同步重写该用例 |
| 3-② | `M6 上游版本空值显示未发布` | `:59-62` `UpstreamList.vue` 含 `<PublishStatusTag`、`:version="record.current_version"`；`:61` `not.toContain("'v' + record.current_version")` | **不受影响（硬约束）** | 发布状态列改动不得回退为裸文本三元 |
| 3-③ | `M7 未分组术语统一`（views 全域扫「未分类」） | `:69-76` 全 `.vue` 文件零「未分类」 | **不受影响（新增标签约束）** | 新的「未关联集群」组标题必须用 `UNGROUPED_LABEL`（组合式已定义），**不得**写「未分类」 |

---

## 4. 共享层（消费方与断言）

### 4.1 `components/BadgeStatus.vue`（胶囊化，仅 CSS）

现状模板（`BadgeStatus.vue:1-6`）：
```vue
<span class="badge-status" :class="'badge-' + status">
  <span class="status-dot" :class="status"></span>
  <span class="status-text">{{ text }}</span>
</span>
```
- **消费方 17 个文件**（`grep -rln BadgeStatus src --include=*.vue`，排除自身）：`PluginMetadata.vue`、`PublishDiffButton.vue`、`SslCertCard.vue`、`StaticResourceStateTag.vue`、`StreamProxyViewDrawer.vue`、`DnsQueryList.vue`、`DnsUdpProxyList.vue`、`GlobalRuleList.vue`、`PluginConfigList.vue`、`PluginMetadataList.vue`、`RouteList.vue`、`StreamProxyList.vue`、`UpstreamList.vue`、`ClusterGlobalRules.vue`、`ClusterPluginConfigs.vue`、`ClusterRoutes.vue`、`ClusterUpstreams.vue`。
- 测试：`components/__tests__/BadgeStatus.test.ts` — `:17` `expect(wrapper.find('.status-dot').classes()).toContain('offline')`，`:10` 文本含「在线」。
- 处置：**待核**。若胶囊化只加 `padding/border-radius/font-size`（保留 `.badge-status` / `.badge-*` / `.status-dot.{status}` / `.status-text`），本测试与全部消费方零改动；若把圆点改成 `.pill` 类或去掉 `.status-dot`，则需同步 §7.1 的 `ClusterNodes.test.ts` / `NodeHealthCard.test.ts` / `Dashboard.test.ts`。
- **硬约束**：胶囊化不得改 `text`/`status` props 契约，不得改 `badge-online/offline/warning/info/neutral` 类名（多处组件测试与源码守卫依赖）。

### 4.2 `components/PublishStatusTag.vue`（`.ps-*` 胶囊化）

- 现状**已经**是 `.ps-tag` 解剖（`PublishStatusTag.vue:34-47`，`.ps-tag{display:inline-block;font-size:12px;padding:0 6px;border-radius:3px}`，`:55-62`）；胶囊化只需把 `border-radius` 改 999px、字号 11px/600，**类名与分支结构不变**。
- 消费方：同 §4.1 的 17 文件清单（`PublishStatusTag` 与 `BadgeStatus` 命中集一致）。
- 测试：`components/__tests__/PublishStatusTag.test.ts`（128 行，17 用例）断言的是 `.ps-published` / `.ps-pending` / `.ps-partial` / `.ps-unpublished` / `.ps-date` 的**存在性与文案/tooltip**，不含样式 → **不受影响**，但**判定顺序**（未发布 → 待发布 → partial → 已发布，`:78-82` 钉死）禁止改动。

### 4.3 `components/PageHeader.vue`（新增 `#stats` slot）

现状（`PageHeader.vue:1-11`）：`.page-header` > `.page-header-info`（`h1` + `p`）+ `v-if="$slots.actions"` 的 `.page-header-actions`。**无标题行容器**承载徽标 → 需在 `.page-header-info` 内包一层 flex 行（`h1` + `#stats`）。
- **消费方 33 个文件**（`grep -rln PageHeader src --include=*.vue`）：`CaCertList`、`EdgeClient`、`MetricsDashboard`、`AnsibleInventory`、`AuditLog`、`EdgeAutostart`、`EdgeImport`、`NodeList`、`DbMigrationPage`、`GlobalRuleList`、`StaticResourceList`、`DnsQueryList`、`ServerCertList`、`DatabaseManagement`、`Metrics`、`EdgeEnv`、`ClusterList`、`UpstreamList`、`NodeTaskCenter`、`PluginConfigList`…（共 33）。新增可选 slot → 默认不渲染，其余页零影响。
- 测试：`components/__tests__/PageHeader.test.ts` — `:20` `expect(wrapper.find('p').text())`、`:27` `expect(wrapper.find('p').exists()).toBe(false)`、`:37` actions slot。**不受影响**，前提：`#stats` 内部**不得新增 `p` 元素**（用 `span`/`div`），且 action slot 类名不变。
- **三页测试桩必须同步**：`NodeList.test.ts:56`、`UpstreamList.test.ts:53`、`RouteList.test.ts:43` 均为
  `PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title','description'] }`
  → **不转发 `#stats`**，页头徽标断言在桩下不可见。新增徽标用例前须改为 `<slot name="actions" /><slot name="stats" />`（或改用真实组件）。

### 4.4 `components/ColumnConfigPopover.vue`

- **消费方仅 3 个**（`grep -rln ColumnConfigPopover src` 排除自身）：`views/clusters/ClusterNodes.vue`、`ClusterUpstreams.vue`、`ClusterRoutes.vue`（统一管理 Tab）。三张独立列表页**未**使用该组件（各自手写 `a-popover`：`RouteList.vue:65-86`、`UpstreamList.vue` 同款）。
- **无专属单测**（`ls src/components/__tests__ | grep -i column` 无命中）→ 改它只有 Tab 页风险。
- E2E 依赖：`e2e/helpers/destructiveFlow.ts:114` `page.locator('button', { hasText: '列配置' }).first()`、`:118` 「显示搜索框」开关、`:123` 再点收起 → **Tab 页**的「列配置」按钮文案与 popover 开关语义禁止改名（独立页若一并换装必须保持同名文案与同款开关）。
- 若三页改用共享 `ColumnConfigPopover.vue`（shared-contract 未要求，属可选收敛）：需补组件测试，且注意 #79 的「重置列宽」入口只在弹窗内。

### 4.5 `composables/useColumnConfig.ts`

- 导出：`resolveOrderedColumns`（:35）、`applyColumnWidths`（:57）、`useColumnConfig`（:76）。
- 消费方 6：三页 + `useClusterNodes` / `useClusterRoutes` / `useClusterUpstreams`。
- 测试：`composables/__tests__/useColumnConfig.test.ts`（残缺顺序 / 槽位填充 / `setColumnOrder` 不丢非默认列）。
- 处置：**不受影响**（本变更按 #79 传 `allColumns`）。**存储兼容**：旧 localStorage 里的 `cluster_name` 由 `resolveOrderedColumns` 未知键裁剪天然忽略，无需迁移（shared-contract §5）——建议**新增 1 条用例**钉住「order 含已删除列键 `cluster_name` 时不报错、该键被丢弃、其余列落座」。

### 4.6 `composables/usePagination.ts`

- 导出 `paginationProps`（:19，`PAGE_SIZE_TABLE` 20、选项 10/20/50/100）。
- 消费方 13：`EdgeClient`、`AuditLog`、`EdgeAutostart`、`NodeList`、`clusters/ClusterRoutes`、`ClusterNodes`、`ClusterUpstreams`、`UpstreamList`、`NodeTaskCenter`、`RouteList`、`UserList`、`DbBackupCard`、`DbMigrationCard`。
- 测试：`composables/__tests__/usePagination.test.ts` — **不受影响**（标准不变，`shared-contract §0` 明确禁止改动）。

### 4.7 `composables/useColumnDragColumns.ts`

- 消费方 6：三页 + 3 张 Tab；测试 `useColumnDragColumns.test.ts`（含同屏多表作用域 `closest('.ant-table-wrapper')`）。
- 处置：**不受影响**（手势层与模式无关）。注意：分组模式下组头行的 `colspan` 不能用拖拽/排序手势，需 `customCell` 结构断言（jsdom 无法验布局，shared-contract §9）。

### 4.8 新增文件（tasks 2.2）

| 文件 | 依据 | 测试要点 |
|---|---|---|
| `components/TableToolbar.vue` | shared-contract §1（props/emits/slots/DOM 契约） | `[data-test="toolbar"]`/`-count`/`-refresh`/`view-mode-group`/`view-mode-flat`；顺序断言（count→refresh→config→mode 最右）；`showMode=false` 不渲染切换器 |
| `components/PageStatBadges.vue` | shared-contract §4 | `[data-test="page-stat"]`；首项 `.ph-lite.lite-accent`；`items` 空不渲染 |
| `composables/__tests__/useListClusterGrouping.test.ts` | **已存在（WIP）** | 现有 11 用例已覆盖语义；**缺**：`sortWithinGroup` 的「分组期休眠 + 平铺不应用」已在 `:107-126` 覆盖 → 无需补语义，只补页面接线 |

---

## 5. 源码守卫测试（正则/文本解析页面源码的，重排版时静默失效）

| 文件 | 解析对象 | 关键断言（行号 + 原文） | 影响 |
|---|---|---|---|
| `views/__tests__/NodeList.source.test.ts` | `readFileSync(…'src/views/NodeList.vue')`（:8-10） | `:15` `toMatch(/<select class="form-input" v-model="formData\.statusCheck">/)`；`:21` 长文案「禁用的节点不进入中继网关流量白名单…」；`:35` `not.toMatch(/sorter:\s*\(/)`；`:43-50` `not.toContain('confirmState'/'executeConfirm'/'function showConfirm'/'okDanger')`、`toContain('showDangerConfirm')`；`:126` `.node-filter-bar {…}` 块内含 `flex-wrap: wrap`；`:136-142` `onLine:` 计数 ≥4 与 `appendStreamLine(` ≥ 对应数、裸推入恰好 1 处；`:149-152` `:mode="execDrawerMode"` 等 | **中风险**：`select` 表单与 SSE 段落不要动；`.node-filter-bar` 类名与 `flex-wrap: wrap` 必须保留或同步改守卫（§1.2-③）；status 列模板窗口 1200 需放宽（§1.2-①） |
| `views/__tests__/uxReviewL.source.test.ts` | `NodeList.vue` | `:29` `not.toMatch(/Edge安装|OpenResty安装|EDGE安装|OPENRESTY安装/)`；`:30` `expect(s).toContain('Edge 安装路径')`；`:31` `expect(s).toContain('OpenResty 安装路径')` | **必改（反转）**：合并列后两个独立标题消失 → 保留中英文空格排版意图，改为断言单一「安装路径」标题 + 两条路径值堆叠（`.path-stack`） |
| `views/__tests__/uxReviewM.source.test.ts` | `UpstreamList.vue` / `RouteList.vue` | `:59-62`（M6 `PublishStatusTag` 用法）、`:90-91`（M9 `slice(0, 3)` / `method-more`） | 见 §3.3 |
| `views/__tests__/ClusterTerminology.source.test.ts` | `src/views/**/*.vue` 全域扫「未分类」 | 零残留 | **硬约束**：新组标题用「未关联集群」 |
| `views/__tests__/tableAnatomy.source.test.ts` | `src/views/**`、`src/components/**`、`utils/edgeColumns.ts` | `:19` `INDEX_COLUMN_RE = /title: '#', key: 'index', width: (\d+)/g`；`:33` `expect(hits).toBeGreaterThanOrEqual(13)`；`:34` 非 45 宽度为 0 | **约束**：三页序号列必须保持**单行** `{ title: '#', key: 'index', width: 45, … }` 写法（prettier 单行），否则扫描命中数掉到 13 以下即红 |
| `views/__tests__/lifecycleCleanupGuards.test.ts` | `NodeList.vue` | `:29-32` `onUnmounted(` 后 500 字符内含 `stopElapsedTimer()`；`:34-41` `loadClusters()` 函数体内含 `message.warning('集群列表加载失败')` | **不受影响**，但重排版不得移动/改动这两处（`onUnmounted` 必须在改动后 500 字符窗口内仍出现 `stopElapsedTimer()`） |
| `views/__tests__/clusterNodesFullFetch.source.test.ts` | 含 `views/NodeList.vue`、`views/RouteList.vue`（:15 注释「删除确认链路（deleteRoute）」） | 禁止 `page_size` 无上限的全量拉取 / 删除确认链路形态 | **约束**：刷新按钮实现不得改成 `page_size=100000` 全量取（刷新语义 = 重新拉当页） |
| `components/__tests__/PublishDiffButton.consumers.source.test.ts` | 含 `src/views/RouteList.vue`（:17、:39 两处清单） | 消费方必须保留 `<PublishDiffButton` 且 re-emit 带 `$event` | **约束**：路由页发布状态列的 `PublishDiffButton` 必须保留；`@click.stop` 不得丢掉 `$event`（约定 #77） |
| `components/__tests__/ClusterSelect.consumers.source.test.ts` | 扫全部 `.vue` 模板 | 「模板里写了 `<ClusterSelect>` 就必须 import」 | **约束**：新工具条/组头若引入 `ClusterSelect` 必须 import（约定 #74） |
| `views/__tests__/tableHeaderHitArea.source.test.ts`（`src/__tests__/`） | `src/style.css` | `.grid-table thead th` 左内距 ≥ 21px、`.th-resize-wrap::before` 命中区 ≥ 16px、`.node-table/.upstream-table/.route-table` 若覆盖 padding 须 `>= 21px` 或 `!important` | **约束**：新增 `.l5-*` 控制台层样式**不得**覆盖这三张表的 `thead th` padding（否则守卫红） |

---

## 6. E2E（Playwright）

| 文件 | 断言（行号 + 原文） | 处置 | 说明 |
|---|---|---|---|
| `e2e/route.spec.ts` | `:31-33` `test('should show sortable columns in route table')` → `await expect(page.locator('.ant-table-column-sorter').first()).toBeVisible()` | **反转（高危）** | 默认视图改为「分组」，而分组模式列定义 `sorter` 置 false → sorter UI 不渲染，本用例必红。改法：先点 `[data-test="view-mode-flat"]` 再断言 sorter 可见 |
| `e2e/route.spec.ts` | `:20-25` `.route-table` 可见、`.ant-table-thead` 可见；`:27-29` `getByPlaceholder('搜索名称、URI、描述...')` 可见（子串匹配） | **不受影响（约束）** | 保留 `.route-table` 类与搜索框 placeholder 前缀 |
| `e2e/upstream-publish.spec.ts` | 搜索 `getByPlaceholder('搜索名称或描述...')`；行定位 `.ant-table-tbody tr` + `hasText: name` | **待核** | 组头行在 tbody 内；行定位若按 `first()`/`nth()` 会错位 → 建议 `filter({ hasText })` 已在用（安全），但 `tr` 计数/序号类断言需复核 |
| `e2e/route-publish.spec.ts` | 同款行定位 + 搜索 `getByPlaceholder('搜索名称、URI、描述...')` | **待核** | 同上 |
| `e2e/upstream-version-management.spec.ts` | 上游页版本/发布交互（搜索或表格行） | **待核** | 受行数与行序影响 |
| `e2e/plugin-editor.spec.ts` | 集群 Tab 路由表（`.route-table`、行定位） | **待核** | Tab 页不改，但若把行定位写成全局 `.ant-table-tbody tr` 且页面同屏有独立页表格则需复核 |
| `e2e/upstream-advanced-config.spec.ts` | `:35`/`:49` 注释「弹窗内第一个 form-input 是所属集群」 | **待核** | 弹窗（UpstreamFormModal）不改；仅当同轮把弹窗也改造时失效 |
| `e2e/route-batch-delete.spec.ts` / `node-batch-delete.spec.ts` / `upstream-batch-delete.spec.ts` | 操作对象是**集群 Tab**（`openClusterTab(...)`），复选框按内容定位 | **不受影响** | Tab 页列/解剖不改；`#59` 序号列语义不变 |
| `e2e/validation.spec.ts` | 登录页校验 | **不受影响** | — |
| `e2e/cluster-list-route-modal-tabs.spec.ts` | 集群页/统一管理页 `h1`、Tab 路由 | **不受影响** | `PageHeader` 标题结构不变（`h1` 保持） |

---

## 7. 待核 / 不受影响清单

### 7.1 待核（13，取决于实现细节或真机行为）

| 文件 | 待核点 |
|---|---|
| `components/__tests__/BadgeStatus.test.ts` | `.status-dot` 类名是否保留（§4.1） |
| `components/__tests__/ClusterNodes.test.ts` | 依赖 `badge-online/offline` 类名（Tab 页节点状态） |
| `components/__tests__/NodeHealthCard.test.ts` | 同上（仪表盘健康卡） |
| `views/__tests__/Dashboard.test.ts` | `badge-neutral` 第三态断言 |
| `views/__tests__/uxReviewM.source.test.ts` | M9 `slice(0, 3)` / `method-more` 是否保留（§3.3-①） |
| `views/__tests__/ClusterTerminology.source.test.ts` | 新组标题不得含「未分类」（应红则说明实现用错标签） |
| `components/__tests__/PublishDiffButton.consumers.source.test.ts` | 路由页 `PublishDiffButton` 是否仍在（§5） |
| `components/__tests__/ClusterSelect.consumers.source.test.ts` | 新组件若用 `ClusterSelect` 必须 import |
| `e2e/upstream-publish.spec.ts` | 组头行对 `tr` 定位/计数的影响 |
| `e2e/route-publish.spec.ts` | 同上 |
| `e2e/upstream-version-management.spec.ts` | 同上 |
| `e2e/plugin-editor.spec.ts` | 全局 `tr` 选择器是否跨表误命中 |
| `e2e/upstream-advanced-config.spec.ts` | 「所属集群」表单项位置（弹窗层，非列表层） |

### 7.2 确认不受影响（16，逐个读过断言，无本变更相关项）

- `views/__tests__/RouteListClusterId.test.ts` — 仅深链 `cluster_id` 预选/请求参数。
- `views/__tests__/lifecycleCleanupGuards.test.ts` — 仅 `onUnmounted` 清理与 `loadClusters` 提示（改动时保持原位即可）。
- `views/__tests__/tableAnatomy.source.test.ts` — 仅序号列宽度 45 与命中数下限（保持单行写法）。
- `views/__tests__/clusterNodesFullFetch.source.test.ts` — 仅 `page_size` 上限 + 删除链路形态。
- `components/__tests__/PublishStatusTag.test.ts` — 断言类名/文案/tooltip/判定顺序，与胶囊化（纯 CSS）无关。
- `components/__tests__/PageHeader.test.ts` — 断 `h1`/`p`/actions slot/`.page-header`；`#stats` 为可选 slot（前提：内部不加 `p`）。
- `components/__tests__/SearchInput.test.ts` / `SearchInput.source.test.ts` — 组件契约与源码红线，工具条重排不改组件。
- `components/__tests__/permissionGroups.source.test.ts` / `AppSidebar.test.ts` — 无新增路由/菜单/权限键（`AppSidebar.vue:261/267/273` 三页菜单项文案不变，本变更不改导航）。
- `composables/__tests__/useColumnConfig.test.ts` — 不涉集群列；按 §4.5 建议补 1 条兼容用例（属「新增」而非改写）。
- `composables/__tests__/useColumnDragColumns.test.ts` — 手势/多表作用域与模式无关。
- `composables/__tests__/usePagination.test.ts` — 分页标准不变（shared-contract §0）。
- `src/__tests__/tableHeaderHitArea.source.test.ts` — 约束性守卫（不得覆盖表头 padding），非反转。
- `e2e/validation.spec.ts`、`e2e/cluster-list-route-modal-tabs.spec.ts` — 集群/统一管理页与登录页。
- `e2e/helpers/destructiveFlow.ts`（辅助非 spec）— Tab 页专用；仅「列配置」按钮文案约束（§4.4）。

---

## 8. 落地顺序建议（风险分批）

**阶段 0（前置，1 次提交）**
1. 先落 `TableToolbar.vue` / `PageStatBadges.vue` / `PageHeader` `#stats` slot（含 `PageHeader.test.ts` 新增 slot 用例）。
2. **三页测试桩改造**（`a-table` 桩过滤 `__groupHeader`、`PageHeader` 桩转发 `#stats`）——这是把 §1.2-①/§2.1-③④/§3.1-② 的「行数雪崩」收敛成零的关键前置，先改桩再改页面可避免大批用例同时红。
3. 裁决两个实现键（写进 `design.md` 增补或本节备注）：**合并列的实现键**（建议 `edge_path` 承载节点「安装路径」、`uri` 承载路由「请求匹配」）与**分组模式默认值**（规格为「分组」，则全部组件测试需显式 `mode` 钉住）。

**阶段 1（节点页，最低风险）**
`NodeList.vue` 列改造（§1.1-③④⑤⑥）→ 同步 `NodeList.test.ts` 拖拽/列宽用例 → `uxReviewL.source.test.ts` L2 反转 → `NodeList.source.test.ts` 窗口放宽。守卫影响最小（无排序语义）。

**阶段 2（上游页）**
列集合整表断言（`UpstreamList.test.ts:193`）→ 目标列退化 chip 渲染（先按 shared-contract §7 的真实形状做 mock）→ 刷新按钮 → 行数/分页断言钉 `mode`。

**阶段 3（路由页，风险最高）**
chips 行迁入表卡 + 计数右置 → 列合并（`methods`+`uri`、优先级徽章、上游 chip、删集群列）→ 平铺限定排序（最易引发 `RouteList.test.ts:560-607` 与 `e2e/route.spec.ts:31-33` 双红）→ 列拖拽几何重算（`:1466-1492`）。

**阶段 4（收口）**
`npx vitest run --maxWorkers=4`（漂移按约定 #58 定性）+ `npx vue-tsc -b` + `openspec validate --all` + 真机三页截图验收（约定 #51②：验收必须落在用户实际操作的独立页，不能只跑 Tab 页或只核 API）。

---

## 附：本清单未覆盖的已知盲区

1. **列序号公式**（约定 #59）：三页均为后端分页 `(page-1)*pageSize+index+1`；分组模式组头行插入后**行号必须连续跳过组头**（WIP 组合式 `sequenceOf()` 已提供，:96-105 用例钉住），但页面模板层公式的断言需在接线时补（本清单未列出，因现无对应既有断言）。
2. **`#emptyText` 槽**（约定 #57）：三页空态槽名须为 `emptyText`；现状未见相关守卫测试，改造时新增一行断言即可，属「新增」但非本变更任务强制项。
3. `docs/ui/Live-Artifact-5/proposal-c/*.html` 的视觉对照属任务 3.3/4.4/5.5，不在断言范围。

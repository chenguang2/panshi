# 面板 Tab 与独立列表页的共用重构方案（2026-11-21）

> 范围：统一管理「最大化面板」7 个 Tab ↔ 左侧菜单 7 个独立列表页。
> 本文只做**方案与排期**，不含代码改动。事实来源：2026-11-21 只读盘点（逐资源行号见各节）。
> 决策前提：用户已选「方案 3（共用表单）+ 方案 2（抽取表格核心）一起规划」，明确**不做**整页级 `mode` 统一组件。

## 一、结论

1. **表单可以立刻收敛**：上游、路由、插件组三对，页面侧组件已是面板内联表单的**超集**（只多一个 `cluster_id`），可直接替换；全局规则两侧**已经共用** `PluginEntityFormModal`；节点、静态资源、插件元数据需要新抽取。
2. **表格核心不能整体抽一个组件**：节点/上游/路由三对的列集、单元格语义、列宽机制、状态载体都不同（面板状态挂在 `cluster` 对象上，页面用本地 ref + 服务端查询）。可行做法是抽**三类原语**：单元格渲染器、动作菜单构建器、卡片动作条，配一个 `ResourceListState` 适配层，两边各自保留页面壳/面板壳。
3. 重复代码量约 **2,500–3,500 行**；按本方案可消除约 **60–70%**，剩余为两个外壳（页面：PageHeader + TableToolbar + chips + 分组 + 批量；面板：紧凑工具条 + 集群上下文）。

## 二、现状差距（事实）

### 2.1 共享程度分三档

| 档 | 资源 | 已共享的部分 |
|---|---|---|
| 高 | 节点 | `useClusterNodes`（列定义、动作配置、CRUD、安装流）两侧共用 |
| 中 | 全局规则 | 表单共用 `PluginEntityFormModal`；删除警告文案共用 |
| 低 | 上游 / 路由 / 插件组 / 静态资源 / 插件元数据 | 仅共享展示组件（PublishStatusTag / PublishDiffButton / VersionManagementModal / PluginEditorDrawer / EmptyState …），表单与表格各写 |

### 2.2 表单差集（逐对，来自盘点）

| 资源 | 面板侧 | 页面侧 | 差集 | 可复用性 |
|---|---|---|---|---|
| 节点 | `ClusterNodes.vue:290-542`（单条 + 批量导入双模式） | `NodeList.vue:340-447` + 导入 `579-657` | 面板无 `cluster_id`；校验方式不同（AntDV rules 含 `max:255` vs 手写 `formErrors`）；批量导入字段面板多「Nginx 目录/默认值编辑」 | **需新抽取** |
| 上游 | `ClusterUpstreams.vue:188-523`（内联 2 tab） | `UpstreamFormModal.vue`（1093 行） | 页面多 `cluster_id`，其余字段为超集 | **直接复用** |
| 路由 | `ClusterRoutes.vue:220-374`（内联 4 tab） | `RouteFormModal.vue`（722 行） | 页面多 `cluster_id`；方法选择 UI 不同（面板 `a-select multiple` vs 页面胶囊 chips） | **直接复用（UI 会变）** |
| 插件组 | `ClusterPluginConfigs.vue:82-118`（手写 modal） | `PluginEntityFormModal.vue` | 页面多 `cluster_id` | **直接复用** |
| 全局规则 | `ClusterGlobalRules.vue:85-94` | 同一 `PluginEntityFormModal` | 无 | **已完成** |
| 静态资源 | `ClusterStaticResources.vue:127-190`（a-form + a-select） | `StaticResourceList.vue:279-334`（原生 select，多 `cluster_id`；`name`/`url_path` 是**死字段**：`formData` 里有但模板不渲染、提交不发送） | 校验逻辑同源（`useClusterStaticResources` 的 `uriValid/publishedValid/pluginValid`），模板两份 | **已抽共享组件（B2a）**；字段集 = 所属集群 + 路由 + 描述 |
| 插件元数据 | 无创建表单（点卡片直接 `POST`） | `PluginMetadataList.vue:271-310`（集群 + 插件双选） | 编辑共用 `PluginEditorDrawer`，回填/提交各写一份 | **需新抽取** |

### 2.3 表格核心差异（阻塞点）

1. **列集不同**：节点（面板 7 列 / 页面 9 列，页面有 `cluster` 与合并子键 `openresty_path`）；上游（6 / 8，页面有 `cluster`/`scheme`，面板有 `description`）；路由（10 / 9，页面 `uri` 列合并方法且方法仅子键）。
2. **单元格语义不同**：节点状态格（面板双 `.ps-tag` 无圆点 220px / 页面 `BadgeStatus` 两行 147px）；上游目标（面板前 2 + `+N` / 页面权重条 + 健康近似）；路由 URI+方法（页面合并双段显隐，面板拆两列）。
3. **列宽机制不同**：面板数值 `scroll.x`（1076/1054/1036）+ `applyColumnWidths`；页面 `useFitColumnWidths`（弹性列 + `minWidths` + 分组模式剥离 `fixed`）。
4. **状态载体不同**：面板把列表/分页/选择挂在 `cluster` 对象（`cluster.nodes`、`cluster.selectedNodeKeys`…）；页面用本地 `ref` + 服务端查询参数。
5. **动作签名不同**：面板 `(cluster, record, key)`；页面 `(record, key)` 或 `(action, record)`；菜单呈现（平铺 vs ⋯ 三栏）不一致。

## 三、方案设计

### 3.1 P1 · 表单共用（低风险）

**做法**：
- 上游：`ClusterUpstreams.vue` 删除内联表单（188–523），改用 `<UpstreamFormModal :clusters="[cluster]" :editing-upstream="…" @saved @publish-requested>`。
- 路由：`ClusterRoutes.vue` 删除内联表单（220–374），改用 `<RouteFormModal :clusters="[cluster]" :default-cluster-id="cluster.id" …>`。
- 插件组：`ClusterPluginConfigs.vue` 删除手写 modal（82–118），改用 `<PluginEntityFormModal resource-type="plugin_config" :clusters="[cluster]" with-publish-guide>`。
- 静态资源：新抽 `StaticResourceFormModal`（字段 = 集群 + 路由 + 描述；面板隐藏集群字段），两处替换；同时抽 `ZipContentsModal`（面板 229–252 / 页面 383–406 近似重复）。
- 节点：新抽 `NodeFormModal`（字段 = 集群 + IP + 三端口 + 两条路径 + 状态；模式 `cluster` 可隐藏集群字段）+ `NodeBatchImportModal`（合并面板「默认值编辑」能力与页面「预览表」能力）。两处替换。
- 插件元数据：新抽 `PluginMetadataCreateModal`（集群 + 插件，面板隐藏集群）；`editPlugin` 的回填/提交收敛进 `PluginEditorDrawer` 的调用适配器（两侧各写一份 → 一份函数 + 两处薄调用）。

**行为变化（需确认）**：
1. 面板路由表单的「请求方法」由下拉多选变页面同款胶囊 chips（`RouteFormModal` 现实现）。
2. 表单统一出现「所属集群」字段：面板传入单集群并**禁用**（信息可见、不可改）。
3. 节点表单校验统一到页面口径（`max:255` 等）；历史数据可能首次出现字段级提示。
4. 上游「节点列表」编辑器改为页面同款（原生表格行）。
5. ~~面板静态资源表单会多出 `name` / `url_path` 两个可编辑字段~~ **勘误（B2a 核实）**：这两个是页面 `formData` 里的死字段（模板不渲染、提交不发送），由后端按路由与 ZIP 推导；共享表单不含它们，面板零功能损失。B2a 实际的变化是：路由下拉统一为可搜索 `a-select`（页面原先为原生 `select`），ZIP 空/错误态统一为页面版视觉。

**收益**：删除约 **900–1,400 行**；校验/提示/提交口径单点。

### 3.2 P2 · 表格核心（中风险，分三层抽出）

**前置：`ResourceListState` 适配层**（新建 `composables/useResourceListState.ts`）
- 定义只读/可写接口：`rows / loading / pagination / selectedKeys / selectKeys() / clearSelection() / reload()`。
- 面板实现：包装 `cluster.nodes / cluster.nodesPagination / cluster.selectedNodeKeys`；
- 页面实现：包装本地 ref + 查询参数。
- 目的：让抽出的单元格/动作/卡片组件**只依赖接口**，不直接碰 `cluster` 或页面 ref。

**层 1 · 单元格渲染器**（`components/resource-cells/`）
- `NodeStatusCell.vue`：`variant: 'panel' | 'page'`（panel = 双 `.ps-tag`；page = `BadgeStatus` 两行）。
- `PublishStatusCell.vue`（统一 Tag + DiffButton 组合）。
- `UpstreamTargetsCell.vue`：`variant: 'compact' | 'detailed'`（detailed 用 `utils/upstreamTargets` 的权重/健康近似）。
- `RouteMethodsCell.vue`：`maxVisible`（面板 2 / 页面 3）。
- `IndexCell.vue`：`page / pageSize` 或回调。
- 各列宽度仍由两侧列定义决定，**不动**列宽机制。

**层 2 · 动作菜单构建器**（`utils/resourceActionMenu.ts`）
- 输入：动作清单（key/title/danger/desc/disabled/visible）、勾选过滤（面板）、模式；
- 输出：`[{ type: 'group', items }, { type: 'divider' }, …]`，三栏结构遵循 #81。
- 面板与页面都只提供「动作元数据 + 处理器映射」，不再各自写菜单模板。
- 处理器签名统一为 `(record, key, ctx?: { clusterId })`；面板在 ctx 里传集群。

**层 3 · 卡片动作条**（`components/ResourceCardActions.vue`）
- `variant: 'flat' | 'menu'`：面板当前平铺文字按钮，页面是「发布 + ⋯」；先支持 `menu`（对齐 #81），面板逐步迁移。
- 适用：插件组 / 全局规则 / 静态资源 / 插件元数据。

**不做（明确非目标）**：
- 不统一列宽算法（面板 `scroll.x` vs 页面 `useFitColumnWidths`）。
- 不把页面壳搬进面板（PageHeader / TableToolbar / chips / 分组 band / 批量条 / 批量删除）。
- 不砍现有面板列（如路由的 `status`/`advanced_match_enabled`）以迁就页面列集；列集差异保留。
- 不改列配置存储键（`node` vs `node_standalone` 等保持分立）。

### 3.3 排期与批次

| 批次 | 内容 | 预计 | 风险 | 回滚 |
|---|---|---|---|---|
| B0 | `ResourceListState` 适配层 + 单元格渲染器骨架（不接线） | 0.5–1 天 | 低 | 独立提交 |
| B1 | P1 表单：上游 → 路由 → 插件组（三处直接复用） | 1–1.5 天 | 低-中（路由 UI 变化） | 每资源一个提交 |
| B2 | P1 表单：静态资源 + 节点 + 插件元数据（新抽取） | 2–3 天 | 中 | 每资源一个提交 |
| B3 | P2 层 2：动作菜单构建器，先接入上游/路由（面板勾选 + 页面硬编码两处） | 1–1.5 天 | 中 | 独立提交 |
| B4 | P2 层 1：单元格渲染器接入（节点 → 上游 → 路由） | 2–3 天 | 中 | 每资源一个提交 |
| B5 | P2 层 3：卡片动作条（插件组 → 全局规则 → 静态资源 → 插件元数据） | 1.5–2 天 | 中 | 每资源一个提交 |

合计约 **8–12 个开发日**（AI 协作下按批推进，每批一次验收）。

### 3.4 每批验收口径

- 单元/组件测试：对应两套测试 + 受影响 composable 测试全绿；`npx vue-tsc -b` 干净。
- 守卫测试同步：`mockupParity.source.test.ts`（面板/页面解剖）、`pageHeaderActions`、`tableAnatomy`、`uxReviewL`（若按钮类变化）。
- 真机：**两侧都截图对照**——面板 Tab 与左侧同名页面各 1 张；改动涉及浮层时补浮层展开截图。
- 断言反转清单（#217）：凡「面板内联表单存在」「按钮类名」「菜单顺序」这类源码断言，改前先列出受影响断言，改后逐条反转或删除并说明理由。
- 回归边界：改动若触及共享组件（`PublishStatusTag`、`EmptyState`、`ListPager`），跑全量 `vitest --maxWorkers=4` 并按 #58 判波动。

## 四、风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| 面板表单换成页面组件后 UI 变化（方法 chips、集群字段、上游目标编辑器） | 用户可见；面板 parity 对齐结论可能被打破 | 每处变化列清单，先给用户确认；`central.html` 若有对应形态同步 |
| 面板状态挂在 `cluster` 对象上，抽取组件若直接读 `cluster` 会把面板语义带进页面 | 页面回归 | 强制走 `ResourceListState`，组件内禁止 import `useCluster*` |
| 列宽机制不同 → 抽单元格时误改列宽 | 表格错位/溢出 | 单元格抽取不碰宽度；列宽改动单独立项 |
| 测试面巨大（两份共约 300+ 用例） | 回归漏网 | 每批按资源跑对应两套 + 守卫；源码守卫改前出反转清单 |
| 与正在进行的 UI 迭代冲突（如后续还要改面板表格） | 合并冲突 | 按资源小步提交，先做低耦合的表单 |

## 五、遗留决策点（需用户拍板）

1. 面板表单是否接受「显示但禁用所属集群字段」（推荐：是，信息完整且与页面一致）。
2. 面板路由表单是否接受「方法选择改为胶囊 chips」（推荐：是，与页面一致）。
3. 卡片四类（插件组/全局规则/静态资源/插件元数据）的动作呈现是否统一为「发布 + ⋯ 菜单」（推荐：是，符合 #81；面板当前是平铺按钮）。
4. 节点批量导入是否合并成一个弹窗（含默认值编辑 + 预览表）（推荐：是，面板现状能力更强）。

## 六、批准与执行状态（2026-11-21）

- 用户批准：按 **B0 → B5** 推进，先做 **B1（表单直接复用：上游 / 路由 / 插件组）**，B0（适配层骨架）紧随其后。
- 五项行为变化全部按推荐执行：
  1. 面板表单显示「所属集群」并禁用；
  2. 面板路由表单方法改为胶囊 chips；
  3. 卡片四类动作统一为「发布 + ⋯ 菜单」（B5 落地）；
  4. 节点批量导入合并为单弹窗（B2 落地）。
- 执行记录：
  - [已完成 2026-11-21] **B1** 面板上游/路由/插件组表单改用共享组件（commit `cfbfe3f5`）：生产代码净减约 600 行；三个共享表单组件新增可选 `defaultClusterId` / `lockCluster`（默认值不影响页面），新增态也能「预选当前集群 + 禁用」；路由方法改胶囊 chips。
  - [已完成 2026-11-21] **B0** `ResourceListState` 契约 + 两个工厂（cluster / local）+ 4 个单元格原语（IndexCell / NodeStatusCell / RouteMethodsCell / UpstreamTargetsCell），**未接线**（全仓生产引用 0），42 例单测 + 6 条源码守卫。
    - 裁决：`UpstreamTargetsCell` 的 detailed 仅 chip + 健康摘要，权重条/占比留到 B4 由页面算好经 props 传入（保持组件纯展示）；
    - `execText` 传完整文案（含「检测」后缀由调用方拼）、`healthTitle` 保留、`clusterResourceState.loading` 可选；
    - 泛型 `<Row, ClusterLike>`：B4 一律用推断，必要时显式写两个参数。
  - [已完成 2026-11-21] **B1.5** 清理三个 composable 的表单死代码：生产 −1,197 / +31（`useClusterUpstreams` 939→288、`useClusterRoutes` 664→275、`useClusterPluginEntity` 293→181），测试 −809；新增 `panelFormDeadCode.source.test.ts` 防回填。保留项：列表加载 / 动作分发 / 发布 / 版本 / 列配置 / 选择态，以及 deps 里「调用方仍在传」的字段（不改公开签名）。
  - [已完成 2026-11-21] **B2a** 静态资源：抽 `StaticResourceFormModal` + `ZipContentsModal`，面板与页面共用；资格判定收敛到 `utils/staticResourceRoute.staticResourceRouteChecks()` 单一入口；两侧字段集 = 所属集群 + 路由 + 描述（`name`/`url_path` 经核实为死字段，见 3.1 勘误）。
  - [已完成 2026-11-21] **B2b-1** 节点单条表单：抽 `NodeFormModal`，面板/节点页共用；校验取两侧更严格者（路径 `max:255`、SSH 端口 1–65535）；另发现并删除 `CentralList.vue` 第三处无入口的死内联表单；面板工具条补「批量导入」独立入口（设计页同步）。
  - [已完成 2026-11-21] **B2b-2** 批量导入合并为 `NodeBatchImportModal`：默认值可编辑 + 预览列并集（含 Nginx 安装目录/状态/原因/移除）+ 弹窗内逐条结果；载荷构造收敛 `useClusterNodes.requestNodeBatchCreate()`；两侧宿主只剩开关 + 刷新；顺手修复已失效的 e2e 导航。
  - [已完成 2026-11-21] **B2c** 插件元数据：抽 `PluginMetadataCreateModal`；可选插件过滤收敛 `utils/pluginMetadataCatalog.filterMetadataPlugins()`（面板树/页面筛选/弹窗三处共用）；**面板移除卡片快捷添加**（按用户裁决），改为工具条「添加插件元数据」；设计页按钮文案同步。
  - [已完成 2026-11-21] **B3** 动作菜单构建器 `utils/resourceActionMenu.buildResourceActionMenu`；上游/路由四处（面板 2 + 页面 2）统一消费，面板与页面菜单序列逐字一致；DNS 行 `disableAll` 接线（承接设计页「DNS 行触发器整体禁用」）。附带记录 antd Dropdown `#overlay` 只取首个 vnode、前导 HTML 注释会让菜单静默为空的陷阱（AGENTS #81⑥）。
  - [已完成 2026-11-21] **A 试点（节点）**：面板「集群节点」Tab 改渲染 `views/NodeList.vue` 的**单集群 scoped 形态**，`views/clusters/ClusterNodes.vue` 及其 3 个测试文件删除（节点表格只剩一份实现）。
    - props 契约：`scopedClusterId?: number | null`（默认 `null` = 页面零变化）。
    - scoped 隐藏：`PageHeader`、分组/集群筛选、`分组|平铺` 切换器、集群列、分组带（恒平铺）；页面级动作（添加节点/批量导入）改由**工具条左侧紧凑钮**（`data-test="scope-add-node"` / `scope-batch-import"`）承载。
    - 保留：状态 chips 行、批量条、行内动作 + ⋯ 菜单、表格、外置 `ListPager`、列配置/列拖拽；列配置存储键分立（面板 `node_panel` / 页面 `node_standalone`）。
    - chips 计数：无 `/nodes/stats` 聚合端点，沿用 `listNodes(page_size=500)` 前端计数，scoped 下请求带 `cluster_id` → 计数与列表同源（无降级）。
    - 能力差集（需用户裁决）：面板失去「批量删除节点 / 编辑选中节点 / 安装下拉」这些面板旧工具条独有入口（逐条删除与安装项仍在行 ⋯ 菜单，批量启动/停止/重载/状态查询在批量条）。`e2e/node-batch-delete.spec.ts` 因此描述的是已移除的 UI，待裁决后重写或下线。
    - 设计页未同步（按约定先报告）：`proposal-c/central.html` 节点 Tab 仍是 `.tab-toolbar` 旧形态，尚无 `.l5-toolbar` / `.l5-chiprow` / `.l5-batchbar` / `ListPager`。
  - [已完成 2026-11-21] **A 试点（上游）**：同一做法——面板「上游」Tab 改渲染 `views/UpstreamList.vue` 的 scoped 形态，`views/clusters/ClusterUpstreams.vue` 及其 2 个测试文件删除。
    - props 契约同上：`scopedClusterId?: number | null`；scoped 隐藏 `PageHeader`/分组与集群筛选/`分组|平铺`/集群列/分组带/全部收起，动作「新建上游」→ 工具条紧凑钮 `scope-add-upstream`（文案「添加上游」）。
    - 列集**以页面为准**：`#/名称(内嵌描述)/负载均衡/目标节点与健康(详细版：逐目标 chip+权重条+占比+健康摘要)/协议/发布状态/操作`；面板旧独立「描述」列与精简 targets 形态随之退场（信息未丢：描述在名称单元格 `.cell-secondary`）。
    - 计数：沿用后端聚合端点 `/upstreams/status-counts`，scoped 下带 `cluster_id` 与 `group_name=__all__`，chips 与列表同源。
    - 能力补齐（用户裁决：能力不能丢）：页面新增**行选择 + 共享批量条**（只有「批量删除」+「清除选择」）；确认复用既有 `showDeleteConfirm`（数据库 / Edge 节点可勾选 + 平台-only 提示），执行走 `composables/useBatchUpstreamDelete.ts`（`DELETE /clusters/{cid}/upstreams`，跨集群按 `cluster_id` 分组顺序请求、节点选择逐集群裁剪），进度弹窗与节点批量条同组件 `BatchActionProgressModal`。筛选/搜索/翻页清空选择（沿用面板 D9 语义）。
    - 面板不再预拉上游（`useClusterUpstreams` 调用从 `CentralList` 移除），上游列表由 scoped 组件自持加载。
    - 设计页未同步（按约定先报告）：`proposal-c/central.html` 上游 Tab 仍是 `.tab-toolbar` + 精简 targets/描述列/无行选择旧形态。
  - [已完成 2026-11-22] **A 试点（路由）**：同一做法——面板「路由」Tab 改渲染 `views/RouteList.vue` 的 scoped 形态，`views/clusters/ClusterRoutes.vue` 及其 2 个测试文件删除（路由表格只剩一份实现）。
    - props 契约同上：`scopedClusterId?: number | null`；scoped 隐藏 `PageHeader`/分组与集群筛选/`分组|平铺`/集群列/分组带/全部收起，动作「新建路由」→ 工具条紧凑钮 `scope-add-route`（文案「添加路由」）。
    - 列集**以页面为准**：`#/名称(内嵌描述)/请求匹配(方法+URI 合并列，methods 仅作列配置勾选键)/上游/优先级(mono P{n})/发布状态/创建时间/操作`；面板旧独立「方法/状态/高级匹配/描述」列随之退场（分组带与合并列承担）。
    - 计数：沿用后端聚合端点 `/routes/status-counts`（**本就支持 `cluster_id`**），scoped 下带 `cluster_id` 与 `group_name=__all__`；列表 `GET /routes?page=1&page_size=20&group_name=__all__&cluster_id={id}`（1596 条规模下仍是服务端分页 20/页，不做全量拉取）。
    - 能力补齐（能力不能丢）：页面新增**行选择 + 共享批量条**（只有「批量删除」+「清除选择」）；确认复用既有 `showDeleteConfirm`，执行走 `composables/useBatchRouteDelete.ts`（`DELETE /clusters/{cid}/routes`，body `{route_ids, delete_db, delete_edge, node_ids?}`，跨集群按 `cluster_id` 分组顺序请求、节点选择逐集群裁剪），进度弹窗与节点/上游批量条同组件 `BatchActionProgressModal`。筛选/搜索/翻页/状态 chip 清空选择（沿用面板 D9 语义）。
    - **DNS 行不可勾选**：`hasDnsPlugin` 行 `getCheckboxProps.disabled`（与设计页 `routes.html` 的「DNS 行禁用」一致），避免批量删除绕过「DNS 路由去 DNS 代理页管理」的守护；发布/⋯ 按钮的既有禁用与 tooltip 指路不变。
    - 面板不再预拉路由（`handleTabClick` 的 `loadRoutes` 移除）；`useClusterRoutes` 仍保留在 `CentralList`——静态资源 Tab 的路由选择清单（`cluster.routes`）仍消费它。
    - 附带修复（共享 CSS，非组件实现）：`style.css` 的面板 ⋯ 触发器规则由 `.node-table` 扩到 `.route-table` / `.upstream-table`——CentralList 的 `:deep(.dbody) .ant-btn{padding:3px 10px}` 曾把 26px 宽触发器内容区压到 4px、svg 被 flex 收缩成 4×12（面板里 ⋯ 看起来是空框，上游 Tab 同样存在）。
    - 设计页未同步（按约定先报告）：`proposal-c/central.html` 路由 Tab 仍是 `.tab-toolbar` 旧形态；`routes.html` 尚无行选择列与 `.l5-batchbar`。
  - [已完成 2026-11-22] **A 推广（全局规则，首个卡片类资源）**：面板「全局规则」Tab 改渲染 `views/GlobalRuleList.vue` 的 scoped 形态，`views/clusters/ClusterGlobalRules.vue` 及其测试删除（全局规则卡片只剩一份实现）。
    - props 契约同上：`scopedClusterId?: number | null`；scoped 隐藏 `PageHeader`/分组与集群筛选/`分组|平铺`/分组带（恒平铺）/卡片上的集群与分组徽标，动作「添加全局规则」（primary）+「批量管理」（切换批量态）→ 工具条左侧紧凑钮（`scope-add-global-rule` / `scope-batch-toggle`）。
    - 卡片解剖**以页面为准**：共享 `.card-grid` + `.std-card` + `.lp-*` + `.l5-menu` 三栏动作菜单（查看/编辑/版本管理 → 分隔线 → 删除）；面板旧紧凑 `.plugin-config-card` + `.pcc-actions` 平铺按钮随 ClusterGlobalRules 退场，卡片与页面完全同构。
    - 计数与请求：`GET /global_rules?cluster_id={id}&group_name=__all__&page_size=500`（该端点**本就支持 `cluster_id`**，无需后端改动）；chips 沿用页面「前端按已加载数据聚合」，scoped 下与列表同源同口径。
    - 批量删除保留页面同一实现（`useBatchDelete` → 全局 `DELETE /global_rules`，`rule_ids`）；面板不新增第二套。
    - 附带修复（共享缺陷，面板暴露）：卡内 ⋯ 菜单是**绝对定位弹层**，面板 `.max-panel` 与 Tab 的 `.tab-content` 均 `overflow: hidden` → 点 ⋯ 只看到一条白边（实测菜单被裁到 4px）。`toggleCardMenu` 的翻转判定由「视口底边」改为「**最近 `overflow != visible` 祖先的底边**」，页面形态行为不变（无裁剪祖先 → 等价视口）。回归 `GlobalRuleList.scoped.test.ts` 「5b」。
    - 面板不再预拉全局规则（`handleTabClick` 的 `loadGlobalRules` 与 `useClusterGlobalRules` 引用一并移除）；`composables/useClusterGlobalRules.ts` 现已无生产引用（清理待裁决：需同步删 `panelFormDeadCode.source.test.ts` 的薄封装用例与 `Cluster.global_rules`/`globalRulesLoadError` 类型字段）。
    - 设计页未同步（按约定先报告）：`proposal-c/central.html` Tab 6（全局规则）仍是 `.plugin-config-card` + `.pcc-actions` 旧形态，尚无 `.l5-toolbar` / `.l5-chiprow` / `.l5-batchbar` / `card-grid` 卡片解剖。
  - [已完成 2026-11-22] **A 推广 3/6（插件组，第 2 个卡片类资源）**：面板「插件组」Tab 改渲染 `views/PluginConfigList.vue` 的 scoped 形态，`views/clusters/ClusterPluginConfigs.vue` 及其测试（`ClusterPluginConfigs.publishState.test.ts`）删除（插件组卡片只剩一份实现）。
    - props/隐藏/新增项与全局规则批完全同构（`scopedClusterId` / `scope-add-plugin-config` / `scope-batch-toggle`）；请求 `GET /plugin_configs?cluster_id={id}&group_name=__all__&page_size=500`（端点本就支持 `cluster_id`，后端零改动）。
    - 插件组特有：卡顶 strip「引用 · N 条路由」与卡内「引用」行在 scoped 下保留（`reference_count`，同集群跨路由复用仍有意义）；删除守卫 PLG-07 与页面同源（`deletePluginConfigWithReferenceCheck` + 后端兜底），未新造判断；卡内插件 chips 按「以页面为准」保留纯展示形态（面板旧的可点 `viewPluginConfigDetail` 随 ClusterPluginConfigs 退场）。
    - 批量删除保留页面同一实现（`useBatchDelete` → 全局 `DELETE /plugin_configs`，`plugin_config_ids`）；批量条无「批量发布」。
    - **附带修复（面板壳存量缺陷，本批暴露）**：Tab 分支由 v-else-if 链改独立 `v-if` 容器后，节点 Tab 仍是裸 `v-else`，它挂到末位 `v-else-if`（globalPlugins）上 → 上游/路由/插件组/静态资源等 Tab 下方**叠渲染整块节点表格**（实测插件组 Tab 下出现 4 行节点表）。节点分支改为显式 `v-if="activeTab === 'nodes'"`，守卫 `CentralList.source.test.ts`「Tab 分支不得用裸 v-else」。
    - 面板不再预拉插件组（`handleTabClick` 的 `loadPluginConfigs` 移除）；`CentralList` 仍保留 `useClusterPluginConfigs` 的 `loadPluginConfigs` 作为 `useClusterRoutes` 依赖占位。`composables/useClusterPluginConfigs.ts` 的面板专用表单态已无生产消费方，仅加「已迁移」注释，清理另批（需同步 `panelFormDeadCode.source.test.ts` 与 `Cluster.plugin_configs`/`pluginConfigsLoadError` 类型字段）。
    - 设计页未同步（按约定先报告）：`proposal-c/central.html` Tab 4（插件组）仍是 `.tab-toolbar` + `.pcc-card`/`.pcc-actions` 旧形态，尚无 `.l5-toolbar` / `.l5-chiprow` / `.l5-batchbar` / `card-grid` 卡片解剖与「引用 · N 条路由」strip。
  - [已完成 2026-11-22] **A 推广 4/6（插件元数据，第 3 个卡片类资源）**：面板「插件元数据」Tab 改渲染 `views/PluginMetadataList.vue` 的 scoped 形态，`components/PluginMetadata.vue` 及其三个测试（`PluginMetadata.{delete,publish,status}.test.ts`）删除（插件元数据卡片只剩一份实现）。
    - props/隐藏/新增项与前两批完全同构（`scopedClusterId` / `scope-add-plugin-metadata` / `scope-batch-toggle`）；请求 `GET /plugin_metadata?cluster_id={id}&group_name=__all__&page_size=500`（全局端点本就支持 `cluster_id`/`group_name`/`plugin_name`，后端零改动）。
    - 插件元数据特有（#87② 定稿口径全部保留，面板内与页面同一份实现）：**配置 JSON 折叠美化块**（`JSON.stringify(v,null,2)` → `.lp-json`，缩进 2 空格 / 等宽 / `max-height:220px` 滚动不裁剪）+ **默认全展开**（只记被收起的 id）+ 工具条全局开关 `config-toggle-all`（无配置卡时不显示）；空配置卡显示「无配置」且 `v-if` 同时判「有配置 && 展开」→ 绝不渲染 `{}`（真机实测 `app` 集群 3 条中 `functions_pre` 为空配置，页面上无空 JSON 块）。
    - 插件名**中文优先**：卡头主标题 `display_name || name`，裸插件名保留为弱化标识 `.lp-key`（mono），目录无中文名时回落插件名并走 mono（`pluginLabel` 改为复用 `utils/pluginMetadataCatalog` 的 `metadataPluginLabel`，不再写第二套 `display_name` 回退）。
    - 创建入口唯一：面板旧「点可用插件卡片直接添加」与「可用插件」清单**不得恢复**（源码守卫钉住 `available-panel`/`plugin-tree`/`configured-panel`），入口 = 工具条紧凑钮 → 共享 `PluginMetadataCreateModal`，scoped 下 `:lock-cluster="isScoped"` + 单元素集群清单（真机：面板弹窗集群下拉显示 `app` 且禁用；页面形态显示占位「请选择集群」可改）。
    - 批量删除：`ids: () => selectedIds.value`（记录主键，后端 `BatchDeletePluginMetadataRequest.metadata_ids`）+ `nameOf: plugin_name`，**键类型已复核兼容**（`plugin_name` 仅作展示与 Edge 定位的 `edge_identifier`，批量端点收货键仍是整型主键，故「按 plugin_name 唯一」不构成字符串 id 问题）；批量条只有「批量删除」。
    - ⋯ 菜单翻转沿用「最近 `overflow != visible` 祖先底边」判定（本批同实现搬运），真机面板内菜单向上翻转且未被 `.tab-content` 裁剪（实测 menu 559→755 < clip 底 795）。
    - 面板 Tab 分支顺带收口：`ClusterStaticResources` 的 `v-else-if` 与插件元数据的 `v-else-if` 全改独立 `v-if`，七个 Tab 一律显式条件（守卫 `CentralList.source.test.ts` 现在断言「不得出现任何 v-else-if 串联」）；该守卫的 Tab 分支区切片锚点由已不存在的 `<!-- Node Form Modal -->` 改 `<ClusterFormModal`（旧锚点 indexOf 返回 -1 → 切片退化为整文件，断言被脚本段的合法 v-else-if 污染）。
    - 面板不再预拉插件元数据（旧面板组件自持 `/clusters/{id}/plugin-metadata`）；`CentralList` 的 `availablePlugins`/`loadAvailablePlugins` 仍被上游/路由/插件组 composable 消费，未动。
    - 设计页未同步（按约定先报告）：`proposal-c/central.html` Tab 5（插件元数据）仍是 `.tab-toolbar` + `.plugin-item.configured` 双列条目 + `.pcc-actions` 旧形态，尚无 `.l5-toolbar`（含 `config-toggle-all`）/ `.l5-chiprow` / `.l5-batchbar` / `card-grid` 卡片解剖与 `.lp-json` 折叠块。
  - [已完成 2026-11-22] **A 推广 7/7（静态资源，最后一个资源——A 推广收口）**：面板「静态资源」Tab 改渲染 `views/StaticResourceList.vue` 的 scoped 形态，`views/clusters/ClusterStaticResources.vue` 及其测试（`ClusterStaticResources.test.ts`）删除（静态资源卡片只剩一份实现）。
    - props/隐藏/新增项与前三批完全同构（`scopedClusterId` / `scope-add-static-resource` / `scope-batch-toggle`）；请求 `GET /static_resources?cluster_id={id}&group_name=__all__&page_size=500`（全局端点本就支持 `cluster_id`/`group_name`，后端零改动）。`useCardClusterGrouping` 在 scoped 下强制 `flat`，`TableToolbar :show-mode="!isScoped"`。
    - **发布进度日志只剩一份（AGENTS #51）**：静态资源发布是**逐节点 HTTP 腿**（`EdgeClient.raw_put` 整个 zip，非 `edge_sync.publish_resource`），原页面内联实现与 `useClusterStaticResources.publishStaticResource` 各有一份（`routeLabel`/`resultStatusLabel` 出「成功（经中继）/成功（直连）」+ 失败节点预选 + 版本弹窗出口条）。本批保留**页面这一份**（面板 Tab 即该组件），composable 内发布/删除/版本/表单态标注「已无面板消费方」但**不删**（另批清理，需同步 `useClusterStaticResources.test.ts` 与 `Cluster.static_resources` 等类型字段）。
    - ZIP 上传：scoped 下同一入口（`useClusterStaticResources.uploadStaticResource` → 预检 32MB + 进度弹窗 + 结果行；`afterUpload` 刷新列表使 chips 同步）。经中继时网关 `client_max_body_size`（32m）超限的 **413** 中文转译保持原样，未吞。
    - 删除语义：单条与批量删除都补 `edgeConsequenceHint`（「将连带删除所选节点上的静态资源文件目录，该路径下的文件随之不可访问」，勾选「Edge 节点」后显示，红字）——此前两入口都只有 `subsetConsequence`，「连带删 Edge 目录」仅存在于 ⋯ 菜单说明里；本批把语义显式化到确认弹窗（ssl/服务器证书域同款 `edgeConsequenceHint`）。批量删除仍走页面既有 `useBatchDelete`（全局 `DELETE /static_resources`，`static_resource_ids`）。
    - **面板壳（CentralList）死代码收敛**：静态资源 Tab 是最后一个消费方，改为 scoped 组件后下列代码全部失去消费方并一并删除——`useClusterStaticResources` / `useClusterRoutes`（仅为静态资源表单提供 `cluster.routes`）/ `useClusterPluginConfigs`（仅是 `useClusterRoutes` 的依赖占位）三个 composable 调用、`versionModal` 状态包与其 5 个 ref、`availablePlugins`/`loadAvailablePlugins`（`/plugins/builtin` 预取）、`currentClusterId`、`_showDeleteConfirmRoute`、`handleTabClick` 的 `staticResources` 预拉分支，以及**本页的共享发布弹窗**（`openPublishModal` + `PublishConfirmModal` 状态与模板块 + `PublishModalOptions` 导入）——七个 Tab 全是独立页组件的 scoped 形态，各自持有发布确认弹窗，面板壳不再发布任何资源。`composables/useClusterRoutes|useClusterPluginConfigs|useClusterStaticResources` 因此在本仓**已无生产引用**（清理另批）。
    - ⋯ 菜单翻转按「最近 `overflow != visible` 祖先底边」判定（前三批同实现）；真机面板内菜单向上翻转且完全在 `.dbody` 裁剪框内（menu y 392→653 ⊂ clip 300→709）。
    - 真机验收（2026-11-22，`/tmp/opencode/parity-max/`）：`a7-panel-static.png`（面板：紧凑钮 + 6 chips + 单卡平铺 + 无集群徽标）、`a7-page-static.png`（页面零变化：页头/分组与集群筛选/分组带/集群徽标齐全）、`a7-menu-panel.png`（菜单未被裁）+ `a7-menu-page.png`（两处菜单项逐字一致：查看 ZIP 内容/编辑/替换 ZIP/版本管理 → 分隔线 → 删除）、`a7-zip-panel.png` + `a7-zip-page.png`、`a7-upload-entry.png`（文件选择框可达）、`a7-batch-confirm.png`（批量确认含节点并集 + 子集后果 + 连带删目录红字，随后取消且数据未变）、`a7-empty-panel.png`（空态 CTA）、`a7-form-panel.png`（集群 `test` 锁定）/`a7-form-page.png`（「请选择集群」可改）；console 0 error。
    - 设计页未同步（按约定先报告）：`proposal-c/central.html` Tab 7（静态资源）仍是 `.tab-toolbar` + `.pcc-card`/`.pcc-actions` 旧形态——待回填清单见本节末「设计页回填」。
  - [待开始] B4 单元格接线 / B5 卡片动作条

### A 推广完成度（2026-11-22）

| Tab | scoped 组件 | 面板专属组件（已删除） | 状态 |
|---|---|---|---|
| 集群节点 | `NodeList.vue` | `clusters/ClusterNodes.vue` | 已接管 |
| 上游 | `UpstreamList.vue` | `clusters/ClusterUpstreams.vue` | 已接管 |
| 路由 | `RouteList.vue` | `clusters/ClusterRoutes.vue` | 已接管 |
| 插件组 | `PluginConfigList.vue` | `clusters/ClusterPluginConfigs.vue` | 已接管 |
| 全局规则 | `GlobalRuleList.vue` | `clusters/ClusterGlobalRules.vue` | 已接管 |
| 插件元数据 | `PluginMetadataList.vue` | `components/PluginMetadata.vue` | 已接管 |
| 静态资源 | `StaticResourceList.vue` | `clusters/ClusterStaticResources.vue` | 已接管（本批） |

**设计页回填（`proposal-c/central.html` Tab 7，待批）**：
1. Tab 体由 `.tab-toolbar`（只有「＋ 添加静态资源」）改为 `.l5-toolbar`：左簇紧凑钮「＋ 添加静态资源」（primary）+「批量管理」（secondary）+ 搜索（150px）+ 右端刷新；再补 `.l5-chiprow` 六枚状态 chips（全部 / 待上传 / 待分发 / 已分发 / 分发失败 / 配置异常，带 `f-count`）。
2. 批量态补 `.l5-batchbar`（已选 N 项 / 批量删除 danger / 全选当前筛选结果 / 清除选择；**无批量发布**）与卡内勾选框让位。
3. 卡片由 `.pcc-card` + `.pcc-actions`（平铺文字按钮）改为共享卡片解剖：`card-grid` + `.std-card.l5-panel` → `.lp-strip`（绑定 · 路由名）/`.lp-head`（名称 + 文件大小 lp-tag + 状态徽章）/`.lp-body`（路径/描述/上传）/四档提示（配置异常、分发失败 + 重发）/`.lp-foot`（重发失败节点或「发布」`.op-pub` + ⋯ 三栏菜单）。
4. 面板 Tab 恒平铺：无分组带、卡片无集群/分组徽标（设计页 Tab 7 现也无 band，保持一致即可，但 `.pcc-head` 的分发路径徽标要换成 `lp-strip` 的绑定信息）。
5. 页底 `.table-note` 的「交互模型」需改口径：静态资源 Tab 已与独立页同构（含状态 chips / 批量删除 / ⋯ 三栏菜单），不再是「迷你卡片 + 平铺按钮」。

## 七、待收口：主 spec 与实现漂移（2026-11-21）

- **`openspec/specs/plugin-metadata-management/spec.md`** 的 Scenario「统一管理 Tab 添加入口同清单过滤」仍描述「面板展示可添加插件（目录分类卡片）」。面板已按用户裁决移除该树（commit `98f260d3`），添加入口改为工具条按钮 + 共享创建弹窗。
- 建议：用一份小变更（MODIFIED 该 Scenario）把表述改为「两处添加入口共用同一创建弹窗；`plugin_metadata_plugins` 清单过滤由弹窗单点承担，面板不承载可选插件清单」，随后 `openspec validate --all` 收口。
- 状态：**已完成（2026-11-21）**。变更 `panel-plugin-metadata-entry-modal` 已归档（`openspec/changes/archive/2026-11-21-panel-plugin-metadata-entry-modal`），主 spec 的该 Scenario 正文已按实现改写（场景标题保留 + HTML 注释记录裁决来源），`openspec validate --all` → 224 passed / 0 failed。

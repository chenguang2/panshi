# Tasks: central-management-ux-review-fixes

## 批 1 · 文案与校验前置（纯前端低风险，TDD 先行）

- [x] 1.1 RED：`ClusterBackupDialog` 组件测试——术语断言（标题/按钮无「恢复」）、非法名称即时报错且按钮禁用、合法名称可提交；GREEN 改文案 + 前置校验（正则与 `schemas/cluster.py NAME_PATTERN` 同源语义）
- [x] 1.2 GREEN：`CentralList` 顶栏「从备份恢复」→「从备份导入」；`AppSidebar`/`ClusterList` 同款入口 grep 清点后同步（ClusterList 顶栏为「备份下载」无恢复措辞，无需改）
- [x] 1.3 RED→GREEN：展开面板「插件元数据」Tab 补计数徽章（断言与卡片统计同源字段）
- [x] 1.4 GREEN：`pageSize: 100` → `PAGE_SIZE_CARD_GRID`（constants.ts 引入，禁字面量）
- [x] 1.5 GREEN：节点表 reload→重载（ClusterNodes + NodeList 两页 + 批量确认文案 + 源码守卫同步）；组头 chips title（已启用/已禁用 · 点击最大化）；`catch (e: any)` ×2 → `unknown` 收窄
- [x] 1.6 全量单测收口 `npx vitest run --no-file-parallelism`（1949/1949）

## 批 2 · 备份弹窗体验（TDD 先行）

- [x] 2.1 RED：下载弹窗摘要行断言（统计计数渲染）+ 勾选静态资源提示；GREEN 取 cluster 统计字段渲染（零项隐藏）
- [x] 2.2 RED→GREEN：上传控件重绘（中文按钮 + 已选文件名 + 清除），保留 `.json` accept 校验
- [x] 2.3 GREEN：下载弹窗补「JSON 备份 vs Excel 导出」语义说明行；导入说明首句前置「不会改动源集群」
- [x] 2.4 GREEN（决策点 1=A）：`useClusterBackup` 校验和登记/携带——下载存 `X-Backup-Checksum`（模块级会话内注册表），同会话导入自动 append `expected_checksum`；篡改返回校验和不符；无记录不附带（钉子测试 ×2）
- [x] 2.5 RED→GREEN：导入失败错误区建议动作行（后端 `detail.errors` 逐条 + 固定建议句）
- [x] 2.6 真页走查（截图 12/13/14）：名称非法即时报错+按钮禁用、合法态、上传控件、摘要行/语义说明均已核验；后端链路在 cluster-backup-restore-fix 已实走

## 批 3 · 刷新与加载模型（决策点 4=A；共享语义，约定 #217 先行）

- [x] 3.1 消费方断言清单：CentralList.test / statTab / source / ClusterListPage / NodeList / NodeList.source 既有断言清点（4 处反转：连接测试说明句 ×2、卡片动作序 ×2、NodeList reload 文案 ×2+守卫 ×1）
- [x] 3.2 RED→GREEN：组件测试——挂载不请求上游、Tab @refresh 后当前 Tab 保持（经 ClusterRoutes emit 真实路径驱动）
- [x] 3.3 GREEN：`loadClusters` 按 id merge 保留运行态字段（CLUSTER_RUNTIME_KEYS 29 项）；`loadUpstreams` 移出挂载预加载（handleTabClick 已有按需加载，挂载请求数 1+2N → 1+N）
- [x] 3.4 回归：`#203` 面板局部刷新语义保持（merge 仅兜底 @refresh 全量路径）；全量串行单测 1949/1949；后端零改动

## 批 4 · 结构润色（TDD 先行）

- [x] 4.1 GREEN（决策点 2=A）：卡片「更多 ▾」收纳 备份下载/导出 Excel——**两分组渲染分支都要改**（历史坑：只改一处致未分组/命名组动作不一致，真页走查抓出后已补齐并加源码守卫 CentralList.source.test.ts 双分支断言）；ClusterList 同款（Excel 导出提为共享 `useClusterUtils.exportClusterExcel` 单一实现）
- [x] 4.2 GREEN（决策点 3=A）：topbar 移除组名仅留最大化（两分支 replaceAll；最大化钮 margin-left:auto）
- [x] 4.3 GREEN：路由/上游空态引导（`#emptyText` 槽 + 主行动按钮，`showAddRouteModal`/`showAddUpstreamModal` 复用）
- [x] 4.4 GREEN：连接测试弹窗维度标注句（CentralList + ClusterList 两份实现都改，#51 清点）；P3-4 动画残留实测为非问题——Vue transition 类在 animationend 后移除，`forwards` 塌陷不跨类存活，无裁切（记录不修）
- [x] 4.5 真页走查：截图 10-14 落点核验（默认视图 topbar/从备份导入、卡片更多菜单、导入弹窗三态、下载摘要）

## 批 5 · 两页顶栏对齐（用户裁决追加：备份入口统一方案 A）

- [x] 5.1 RED：ClusterListPage 顶栏「从备份导入」按钮 → 弹窗 import 模式断言；CentralList 顶栏「备份下载」→ download 模式断言
- [x] 5.2 GREEN：ClusterList 弹窗 mode ref 化 + 顶栏导入按钮；CentralList 顶栏下载按钮（null 目标 = 弹窗内下拉，B6.6）+ 弹窗补 `:clusters`；卡片「更多 → 备份下载」显式置 download 模式；两页顶栏按钮序统一（备份下载 / 从备份导入 / + 新建集群）
- [x] 5.3 真页走查：两页顶栏截图核验同款；47/47 + vue-tsc 0 error

## 批 6 · 路由深链语义修复（用户报告：集群管理卡片点「路由」弹新建窗；裁决 A）

- [x] 6.1 RED→GREEN：RouteList 7.6 测试重写为规格语义（route-management「Deep link preselects cluster」= 深链进入后手动新建才预选）——进页不自动开弹窗 + `?cluster_id=` 过滤保持 + 手动新建预选授权内集群 + 未授权不预选
- [x] 6.2 GREEN：移除 onMounted 自动开窗分支，`deepLinkedClusterId` 仅作 `openCreateModal` 预选源；规格本就如此定义（实现超纲撞车 cluster-stat-links 的「查看」语义，且自动开窗无真实消费方），无 spec delta
- [x] 6.3 真页走查：集群管理卡片点「路由」→ 落 `/routes?cluster_id=N` 过滤列表无弹窗；手动新建正常开窗；35/35 + vue-tsc 0 error

## 批 7 · 统一管理分组筛选（用户裁决追加：与集群管理对齐）

- [x] 7.1 RED：组件测试——分组下拉选项（全部分组/未分组/各组）、选组仅显示该组+计数同步、未分组过滤、空态清除筛选恢复全量
- [x] 7.2 GREEN：工具栏加分组下拉（groupOptions 复用既有 computed）；`filteredClusters` 三分支（与搜索/状态叠加非短路）；`hasActiveFilters`/`clearFilters` 纳入 groupFilter
- [x] 7.3 真页走查：选 test 组 → 仅 test 组 3 集群（截图 32）；全量串行 1952/1953（1 例为未触碰文件的既有 CPU 争抢波动，隔离复跑绿，#58 协议）

## 批 8 · 卡片身份条 + 静态资源图标化（用户裁决追加：@designer 方案批准后实施）

- [x] 8.1 spec delta：cluster-card-grid（身份条/纯描述副标题/topbar-extra）+ cluster-static-resources-component（图标范式与独立页**有意分化**，能力集合不缺）
- [x] 8.2 RED→GREEN：ClusterCard 身份条（`.cl-topbar-name` 恒显 name + tooltip 带 ID、区域微章显隐、topbar-extra、副标题回退移除）——34/34
- [x] 8.3 GREEN：CentralList 两分支 topbar→topbar-extra（去 margin-left:auto 内联）；ClusterList 零改动（不传 slot 即身份条+留空）
- [x] 8.4 RED→GREEN：静态资源行图标化（Edit/Upload/FolderOpen 图标 + tooltip；发布/版本管理保留文字右置；failed 态 SendOutlined 警示色；broken 6 控件禁用带指路 + 删除可用；补 `!sr.id`/`!current_version` 两处现状缺失 tooltip）——11/11（a-button 桩属性透传）
- [x] 8.5 真页走查：两页身份条 + 区域微章 + 静态资源正常/配置异常两态单行无换行（截图 40/41/42）；全量串行 1955/1955 + vue-tsc 0 error
- [x] 8.6 AGENTS.md #52 契约同步（身份条/副标题/守卫文件名据实修正）

- [x] 8.7 设计定稿（用户三裁决）：去「标识」前缀词 → CodeOutlined 图标 + mono 名（tooltip 保留）；区域微章移除——区域唯一露出面 = 卡片头路径徽章「经中继 · 区域名」（kjc 同名复读案例：原设计为三处重复）；34/34 + 全量串行复跑（RouteList 1 例漂移为既有 CPU 争抢波动，隔离复跑绿，#58 协议）

## 批 9 · 侧边栏菜单信息架构（用户裁决：统一管理→核心功能；监控组；综合解散；监控组序=边缘网络后）

- [x] 9.1 分析+设计提案（6 组 25 项逐项裁决：综合=杂物抽屉；中继区域管理错放系统管理）→ 用户批准
- [x] 9.2 RED→GREEN：AppSidebar 菜单信息架构 4 用例——组序断言、核心功能前三位（概览/统一管理/集群管理）、监控组内容与排序、中继归运维；既有证书管理相邻断言放宽为「位于核心功能之后」（批 9 插入监控组所致）
- [x] 9.3 GREEN：coreItems 插统一管理；监控组（指标总览→指标查询→ClickHouse 配置）；综合组删除；中继区域管理移入 edgeItems（relay_gateway feature 门控不变）；系统管理/运维管理对调（运维在前、管理面收尾）
- [x] 9.4 守卫协同：Dashboard 源码守卫**逮住真缺陷**（metrics 两项 feature 门控在重写中丢失→关闸后菜单仍显示，#61③）——补 `feature: 'metrics'` 与全站同构，守卫特例分支删除
- [x] 9.5 用户微调：监控组序移至边缘网络之后（组序断言同步）；真页走查（组序 JSON + 截图 50）；全量串行 1959/1959 + vue-tsc 0 error

- [x] 9.6 插件开关归核（用户二次裁决：静态资源之后）——迁入 coreItems 尾部；门控对齐后端 `require_permission('plugin_management')`（adminOnly 过紧修正）；信息架构断言 +1；全量串行 1960/1960（首跑 1 例漂移，复跑全绿，#58 协议）

## 收口

- [x] 5.1 全量 `npx vitest run --no-file-parallelism`（151 文件 / 1949 用例全绿；4 个 unhandled 为 StreamProxyFormWizard jsdom scrollIntoView 既有环境噪音，与本变更无关）+ `openspec validate --all` 0 error
- [x] 5.2 AGENTS.md 约定同步：#17 补「UI 术语用导入不用恢复」；#54 白名单核对（CentralList 已对齐 PAGE_SIZE_CARD_GRID）

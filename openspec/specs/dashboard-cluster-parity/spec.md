# dashboard-cluster-parity Specification

## Purpose
TBD - created by archiving change dashboard-cluster-parity. Update Purpose after archive.

## Requirements

### Requirement: 集群卡片采用卡片页统一解剖

集群卡片（两页共用单点）SHALL 使用 l5-panel 解剖，与全站卡片页同语言。

#### Scenario: 卡片身份区

- **WHEN** 渲染集群卡
- **THEN** 根节点为 `article.l5-panel` 且挂集群色相类（cluster_id % 8 → cluster-c1..c8）
- **THEN** lp-head 含显示名（display_name 优先）与标识 tech tag（mono 弱色），均带 ID tooltip
- **THEN** 标题条不含分组名（分组头/band 承载）

#### Scenario: 状态与版本徽标

- **WHEN** 渲染集群卡
- **THEN** lp-status 含已启用/已禁用 badge、配置版本 ps-tag（三态：配置 vN / 已发布 / 未发布）、可选中继徽章（页面传入 routeBadge）

#### Scenario: 节点行与健康比

- **WHEN** 集群有节点
- **THEN** lp-body 节点行显示前 3 个节点 chips（在线/离线圆点），超出部分「…还有 N 个」，右端「N/N 健康」按健康分级着色
- **WHEN** 集群无节点
- **THEN** 显示「未挂节点」占位（行高恒定）
- **WHEN** 存在离线节点
- **THEN** 渲染 lp-notice 离线警示（数量 + 首个 IP:port 具体化，多节点带「等」）

#### Scenario: 统计格分域

- **WHEN** 渲染统计区
- **THEN** 七格（节点/上游/路由/插件组/全局规则/插件元数据/静态资源）
- **WHEN** 页面传入 statClick
- **THEN** 点击回调 key（nodes/upstreams/routes/pluginConfigs/globalRules/pluginMetadata/staticResources），不跳路由
- **WHEN** 未传 statClick
- **THEN** 七格为 router-link，href 携带 `cluster_id` 深链

### Requirement: 集群管理页采用卡片页同构结构

集群管理页 SHALL 采用与卡片页同构的结构：TableToolbar 工具条 + 状态 chips 行 + 分组|平铺双模式网格，功能面保持不变。

#### Scenario: 工具条与状态行

- **WHEN** 渲染集群管理页
- **THEN** 第一行 TableToolbar（搜索 150 / 分组 104 / spacer / 全部收起 / 分组|平铺 seg；不显示「共 N 个」）
- **THEN** 第二行状态 chips（全部 N / 已启用 N / 已禁用 N，点击筛选）

#### Scenario: 分组与平铺

- **WHEN** 分组模式
- **THEN** 每分组一条 ClusterBand（分组名 + N 个集群 + 组级次要指标「节点 N · 路由 N」+ 折叠；左条 = 组内集群色相）
- **WHEN** 平铺模式
- **THEN** band 隐藏，卡片自身承载集群身份（左缘色条）
- **THEN** 工具条「全部收起/全部展开」按钮随当页折叠态切换文案

#### Scenario: 功能面保留

- **WHEN** 使用集群管理的任一功能（新建/编辑/删除/连接测试/漂移检测/备份下载/从备份导入）
- **THEN** 行为与既有实现一致（仅呈现层变化）

### Requirement: 概览页信息架构

概览页 SHALL 采用「页头 + 大数统计 + 三列状态卡 + 快捷入口」四段信息架构，数据与权限门控复用既有接口。

#### Scenario: 页头与大数统计

- **WHEN** 渲染概览页
- **THEN** 页头含 ph-lite 补充维度（N 集群 / M 节点）、「更新于 MM/DD HH:mm」采样时间戳与「刷新」按钮；SHALL NOT 显示「新建集群」
- **THEN** 大数统计 4 卡（集群/节点/上游/路由），集群色相左条，点击直达对应列表页；节点卡副文案为「健康 N · 离线 M」
- **THEN** 大数卡遵循权限门控（无权限资源不渲染，403 防御静默）

#### Scenario: 三列状态卡

- **WHEN** 渲染状态卡区
- **THEN** 集群卡（名称+标识/启用徽标/健康比）、节点连通状态卡（IP:端口/集群/检测通过·失败）、最近创建的路由卡（名称/URI/发布四态）
- **THEN** 各卡头部带规模徽标与「查看全部 →」深链；空态/加载态/错误重试沿用既有机制

#### Scenario: 快捷入口

- **WHEN** 渲染快捷入口
- **THEN** 芯片按既有 quickLinks 门控渲染（permission/feature/adminOnly）
- **THEN** 资源类芯片带计数徽标（countKey）；运维操作类芯片带 feature 运行态圆点

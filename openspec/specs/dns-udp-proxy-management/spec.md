# dns-udp-proxy-management Specification

## Purpose

DNS 代理（UDP）页面的管理语义：四态发布状态呈现与域内端点推导、状态分段筛选、删除确认增强与诚实终态、内外网分离可配、资源名词一致性、查看抽屉领域信息完整、空态与搜索体验、发布确认与 TTL 单位一致性。与四层代理页（stream-proxy-management）共享同一套组件与语义，差异仅资源类型。来源：dns-udp-proxy-ux-parity（2026-10-23 体验评审，核验 18/18）。

## Requirements

### Requirement: DNS 代理卡片四态发布状态

DNS 代理（UDP）页面 SHALL 使用与四层代理页一致的 PublishStatusTag 四态呈现（未发布/已发布/待发布/发布未完全生效），SHALL 移除自制二元徽章；页面 SHALL NOT 自行按 current_version 推导状态。卡片 SHALL 传递 `pending_publish` 与 `last_publish_status` 至 PublishStatusTag。

#### Scenario: 编辑已发布代理后呈现待发布
- **GIVEN** 某 DNS 代理已发布（current_version 非空）
- **WHEN** 用户编辑该代理并保存
- **THEN** 卡片 SHALL 显示「待发布」态而非「已发布」
- **AND** 域内列表端点响应 `pending_publish` SHALL 为 true

#### Scenario: 部分发布后呈现未完全生效
- **WHEN** 发布到多节点且部分失败
- **THEN** 卡片 SHALL 显示「⚠ 发布未完全生效」态

### Requirement: DNS 代理域内端点四态推导

`GET /clusters/{cluster_id}/dns-proxies`（列表）与 `GET /clusters/{cluster_id}/dns-proxies/{id}`（详情）SHALL 携带 `pending_publish`（经 `edge_sync.derive_pending_publish` 推导）与 `last_publish_status` 字段，与集群域 stream-proxies 端点保持同一推导实现，MUST NOT 另行实现。

#### Scenario: 域内列表携带推导字段
- **WHEN** 客户端请求 DNS 代理列表或详情
- **THEN** 每个条目 SHALL 携带 `pending_publish` 与 `last_publish_status`
- **AND** 编辑已发布代理后列表响应 `pending_publish` SHALL 为 true

### Requirement: DNS 代理列表状态分段筛选

DNS 代理列表 SHALL 提供与四层代理页一致的状态分段控件（全部/未发布/待发布/已发布 + 计数徽章）：连接式分段样式、`aria-pressed` 激活语义、计数 0 段降透明可点、与筛选行同一行布局。

#### Scenario: 点击待发布段过滤列表
- **WHEN** 用户点击「待发布」段
- **THEN** 列表 SHALL 仅显示 `pending_publish=true` 的代理
- **AND** 激活段 SHALL 呈现实底反白且 `aria-pressed=true`，视口 SHALL NOT 发生滚动

### Requirement: DNS 代理删除确认与部分失败处理

DNS 代理删除 SHALL 使用与四层代理页一致的删除确认增强（节点在线/离线标识、默认全选在线节点、子集删除后果行、部分失败「重试删除」）。删除进度终态判定 SHALL 诚实：`delete_edge=true` 但所选节点全部未执行 Edge 删除时 SHALL 呈警示态（非成功），并说明原因与后续动作。

#### Scenario: 只选离线节点删除不假成功
- **WHEN** 用户在删除确认中仅勾选离线节点并确认删除
- **THEN** 进度弹窗 SHALL 呈警示态（exception）
- **AND** 日志 SHALL 说明「所选节点均未执行 Edge 删除（离线或不可达）」
- **AND** SHALL NOT 显示绿色「已完成」

#### Scenario: 部分失败可重试
- **WHEN** 多节点删除部分失败
- **THEN** 终态 SHALL 出现「重试删除」，仅对失败节点重跑 Edge 删除

### Requirement: DNS 代理向导内外网分离可配

创建与编辑 DNS 代理时，内外网分离（WAN）开关 SHALL 始终可见可操作，SHALL NOT 因代理类型 toggle 区的显隐逻辑被连带隐藏。

#### Scenario: 新建 DNS 代理可开启内外网分离
- **WHEN** 用户从 DNS 代理页新建并进入配置步
- **THEN** 内外网分离开关 SHALL 可见
- **AND** 勾选后 SHALL 可配置外网地址映射

#### Scenario: 编辑可关闭内外网分离
- **WHEN** 用户编辑已启用内外网分离的代理
- **THEN** 开关 SHALL 显示当前启用状态且可关闭

### Requirement: DNS 代理界面资源名词一致性

DNS 代理页的全部用户可见文案（向导标题、提交按钮、成功/失败 toast、抽屉标题）SHALL 使用「DNS 代理」名词，SHALL NOT 出现「四层代理」；批量入口与页面标题文案 SHALL 与资源类型一致。

#### Scenario: 创建成功 toast 名词正确
- **WHEN** 用户在 DNS 代理页创建成功
- **THEN** toast SHALL 为「DNS 代理已创建」

#### Scenario: 向导标题名词正确
- **WHEN** 用户打开新建或编辑向导
- **THEN** 标题 SHALL 为「新建 DNS 代理」/「编辑 DNS 代理」

### Requirement: DNS 代理查看抽屉信息完整

查看抽屉 SHALL 正确渲染 DNS 代理领域信息：状态行使用 PublishStatusTag 四态（组件 SHALL 显式导入）；域名映射 SHALL 按 dns_config 实际结构（hosts 键）渲染；DNS 型 SHALL NOT 显示「负载均衡」等仅适用于四层转发的字段行。

#### Scenario: 抽屉显示域名映射
- **WHEN** 用户查看配置了域名映射的 DNS 代理
- **THEN** 抽屉 SHALL 列出各域名（含类型与节点数）
- **AND** SHALL NOT 显示「无 DNS 配置」

#### Scenario: 抽屉状态行渲染
- **WHEN** 用户打开查看抽屉
- **THEN** 状态行 SHALL 渲染四态状态标签（空白为缺陷）

### Requirement: DNS 代理列表空态与搜索体验

列表空态 SHALL 区分「无数据」与「搜索无结果」两形态（后者含关键词与清除筛选入口）；搜索 SHALL 使用共享防抖实现；卡片目标标签权重格式与四层代理页一致（`:100`）。

#### Scenario: 搜索无结果
- **WHEN** 搜索关键词无匹配
- **THEN** 空态 SHALL 显示「没有匹配「关键词」的 DNS 代理」与「清除筛选」入口

### Requirement: 发布确认与 TTL 单位一致性

发布确认弹窗 SHALL 携带资源名标题与「本次发布将创建新版本 v(N+1)」提示；TTL 在卡片/抽屉/表单的展示 SHALL 统一为「N s」格式。

#### Scenario: 发布确认提示版本
- **WHEN** 用户点击卡片「发布」
- **THEN** 确认弹窗标题 SHALL 含代理名
- **AND** SHALL 显示当前版本与将创建的新版本号

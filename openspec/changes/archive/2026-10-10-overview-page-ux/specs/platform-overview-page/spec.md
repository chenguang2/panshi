# platform-overview-page Delta

## ADDED Requirements

### Requirement: 概览页数据语义诚实化

概览页 SHALL 只表述数据真实承载的语义：集群状态徽章 SHALL 显示「已启用 / 已禁用」（语义 = `Cluster.status` 平台侧启用开关），SHALL NOT 使用「正常运行 / 离线」等运行健康表述；节点连通状态 SHALL 表述为「检测通过 / 未检测 / 检测失败」三态（语义 = 上次连通性测试回写结果 + `status_detail` 判空区分从未测试节点），SHALL NOT 使用「在线 / 离线」等实时心跳表述，SHALL NOT 把从未测试的节点计入「检测通过」。页面副标题 SHALL 为「平台资源统计与快捷入口」。

#### Scenario: 集群启用状态表述

- **WHEN** 查看集群卡状态列
- **THEN** `status===1` 显示「已启用」、否则「已禁用」，与集群管理页及导出口径一致
- **AND** 概览页 SHALL NOT 出现以「正常运行」「离线」描述集群的字样

#### Scenario: 节点连通状态三态表述

- **WHEN** 查看节点连通状态卡
- **THEN** 卡片标题为「节点连通状态」，头部摘要为「检测通过 X」「未检测 Z」「检测失败 Y」三段（未检测用中性灰徽章），失败明细行徽章为「检测失败」
- **AND** 未检测=0 且失败=0 且存在节点时 SHALL 显示「全部 N 个节点上次检测通过」绿色横幅
- **AND** `status===1` 且 `status_detail` 为空的节点 SHALL 归入「未检测」，SHALL NOT 计入「检测通过」

#### Scenario: 页面定位表述

- **WHEN** 打开概览页
- **THEN** 页面副标题为「平台资源统计与快捷入口」，SHALL NOT 承诺「运行状态」类实时语义

### Requirement: 数据加载三态（错误 > 空态 > 加载）

概览页各数据区 SHALL 具备错误态、空态与加载态，且任何接口失败 SHALL NOT 以 0 值或空表伪装成功。失败信息 SHALL 说明发生了什么、影响范围，并提供「重试」出口；重试 SHALL 只重新发起失败的请求；刷新加载 SHALL 保留旧数据。后端 403 属预期的权限拒绝而非系统故障，SHALL NOT 触发错误横幅。

#### Scenario: 全部已发起请求失败

- **WHEN** 页面发起的全部数据请求都失败
- **THEN** 页头下方 SHALL 出现 danger 横幅「数据加载失败，请检查后端服务是否可用」并附「重试」按钮
- **AND** 统计卡与表格 SHALL NOT 显示 0 值 / 空表的完成态假象

#### Scenario: 权限拒绝不伪装成故障

- **WHEN** 用户无某数据区权限（该区按权限规则不渲染、不请求；见「数据区与入口按权限显隐」）
- **AND** 防御路径下仍收到该区 403 响应（如权限键漂移）
- **THEN** 该区 SHALL 静默隐藏且不计入 `loadErrors`，SHALL NOT 出现「数据加载失败」类错误横幅

#### Scenario: 部分接口失败

- **WHEN** 部分接口失败
- **THEN** 横幅 SHALL 列出失败资源名（「部分数据加载失败：{资源名}，以下内容可能不完整」），失败数据区 SHALL 显示「加载失败 [重试]」轻量错误条
- **AND** 点击「重试」SHALL 只重新发起失败的请求，成功区数据不重复拉取

#### Scenario: 加载态与刷新保旧

- **WHEN** 首次加载数据
- **THEN** 表格区 SHALL 显示 loading 态（TableCard 透传 a-table loading），统计卡 SHALL 呈现加载中样式
- **WHEN** 手动刷新且接口尚未返回
- **THEN** 旧数据 SHALL 保留展示，SHALL NOT 清空或回到全 0

#### Scenario: 空态引导

- **WHEN** 某数据区无数据且加载成功
- **THEN** SHALL 显示上下文引导空态（如「还没有集群，去创建 →」链接至对应管理页），SHALL NOT 只显示默认「暂无数据」

### Requirement: 数据区与入口按权限显隐

快捷入口、更多资源、统计卡与三张数据卡（集群、节点连通状态、最近创建的路由）SHALL 复用与侧边栏（AppSidebar）同源的 `permission + feature + adminOnly` 三元模型过滤；无权限用户 SHALL NOT 看到点击后被路由守卫静默弹回的入口。无权限的数据区 SHALL 不渲染且 SHALL NOT 发起对应请求（fetch-visible-only）。「数据库管理」chip SHALL 附风险副标注「含恢复/迁移等高危操作」。

#### Scenario: 非管理员入口过滤

- **WHEN** 不持有某入口所需权限（或功能开关关闭、或非管理员访问 adminOnly 入口）的用户打开概览
- **THEN** 该入口 SHALL NOT 渲染（含快捷 chip 与对应统计卡）
- **AND** 过滤后为空的分组卡片 SHALL 整卡隐藏

#### Scenario: 数据区显隐与请求联动

- **WHEN** 用户不具备 `clusters` / `nodes` / `routes` 某项权限
- **THEN** 对应数据卡（集群 / 节点连通状态 / 最近创建的路由）SHALL NOT 渲染，且页面 SHALL NOT 向该区对应接口发起请求
- **AND** 空态引导 CTA（如「还没有集群，去创建 →」）SHALL 受同键权限约束——无权限时空态文案 SHALL NOT 渲染跳转链接

#### Scenario: 权限键与侧边栏同源

- **WHEN** 实现或调整入口过滤映射
- **THEN** 每个入口的 permission / feature / adminOnly 取值 SHALL 与 AppSidebar 同路由菜单项完全一致（如 /node-tasks→task_center、/audit-log→audit_logs+audit_log feature、/database-management→database_management 双门控、/users→adminOnly、/metrics/dashboard→metrics 双键）
- **AND** 概览页入口 SHALL NOT 出现侧边栏按权限隐藏、概览却展示的错位

#### Scenario: 高危入口风险标注

- **WHEN** 查看快捷入口中的「数据库管理」
- **THEN** 该 chip SHALL 显示「含恢复/迁移等高危操作」副标注，与其余普通导航 chip 形成可感知差异

### Requirement: 手动刷新与数据时间锚点

PageHeader 操作区 SHALL 提供「刷新」按钮与「更新于 HH:mm」时间戳；刷新期间按钮 SHALL 禁用并显示「刷新中…」，完成后 SHALL 更新时间戳。「更新于」在首次成功加载前 SHALL NOT 渲染（无假时间锚点）。数据加载编排 SHALL 收敛为单一 `loadAll()` 实现，其 in-flight 防并发守卫 SHALL 统一覆盖头部「刷新」与各数据区「重试」入口。

#### Scenario: 手动刷新全量生效

- **WHEN** 具备页面访问权的用户点击「刷新」
- **THEN** 全部已启用数据区重新拉取（无权限数据区不请求）、期间按钮禁用显示「刷新中…」、完成后「更新于」时间更新为本次完成时刻
- **AND** 刷新或重试进行中，任何入口的重复触发 SHALL NOT 产生并发重复请求（in-flight 守卫统一保护）

#### Scenario: 从未成功加载时不显示假时间

- **WHEN** 页面加载后尚无任何一次成功的数据加载
- **THEN** 「更新于」SHALL NOT 渲染，SHALL NOT 显示占位假时间

### Requirement: 节点摘要数据源统一

节点摘要（统计卡副标题与节点连通状态卡头部徽章）SHALL 以 `GET /dashboard/stats` 的 `nodes` / `nodes_online` / `nodes_untested` 计数为准，并按三态口径派生：**检测通过 X = nodes_online − nodes_untested，未检测 Z = nodes_untested，检测失败 Y = nodes − nodes_online**；从未测试的节点（`status==1` 且 `status_detail` 为空）SHALL 归入「未检测」。节点列表接口 SHALL 仅作为检测失败节点的明细来源。

#### Scenario: 摘要三态计数一致

- **WHEN** 查看节点统计卡与节点连通状态卡
- **THEN** 两处「检测通过」「未检测」「检测失败」数字同源于 stats 派生口径，SHALL 一致
- **AND** 统计卡节点副标题 SHALL 显示「通过 X · 未检测 Z · 失败 Y」动态文案
- **AND** 后端 `GET /dashboard/stats` SHALL 返回 `nodes_untested`（`count where status==1 AND status_detail IS NULL`）

#### Scenario: 明细截断提示

- **WHEN** 节点列表接口返回条数达到分页上限（500）
- **THEN** 失败节点明细区 SHALL 提示「节点数超过明细上限，失败清单可能不完整」

### Requirement: 最近创建的路由含时间列与行定位

最近路由区标题 SHALL 为「最近创建的路由」，表格 SHALL 包含「创建时间」列（数据来自后端 `RecentRouteItem.created_at`，前端以 `formatMonthDayTime` 渲染），表格行 SHALL 可点击跳转路由管理页。

#### Scenario: 创建时间列可见

- **WHEN** 查看最近创建的路由表格
- **THEN** 每行显示创建时间（后端返回的 `created_at`，naive UTC 按 Asia/Shanghai 短格式渲染）
- **AND** 后端响应 SHALL 包含 `created_at` 字段（Route.created_at 已存在，仅补响应透传）

#### Scenario: 行点击定位

- **WHEN** 具备 `routes` 权限的用户点击最近路由行
- **THEN** 跳转 `/routes` 路由管理页
- **AND** 无 `routes` 权限的用户 SHALL NOT 绑定行点击（不渲染可点击样式）

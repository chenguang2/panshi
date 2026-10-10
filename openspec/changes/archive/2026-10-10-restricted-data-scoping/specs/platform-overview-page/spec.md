# platform-overview-page Delta

## MODIFIED Requirements

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

#### Scenario: 空态引导（按角色区分）

- **WHEN** 某数据区无数据且加载成功
- **THEN** SHALL 显示上下文引导空态，SHALL NOT 只显示默认「暂无数据」
- **AND** 管理员的空态文案 SHALL 为「还没有{资源}，去创建 →」（链接对应管理页）
- **AND** 非管理员的空态文案 SHALL 为「暂无可见{资源}，前往{资源}管理 →」（仍链接对应管理页），SHALL NOT 使用「去创建」类对受限用户误导的指引

## ADDED Requirements

### Requirement: 受限视角口径一致

受限用户（非管理员）在概览页看到的统计卡数字与明细数据 SHALL 同源于其被分配集群口径（后端 cluster-visibility-scoping 契约），SHALL NOT 出现「统计卡全局计数 vs 明细卡分配口径」的同页矛盾；最近创建的路由 SHALL 仅含可见集群的路由。

#### Scenario: 集群计数与明细一致

- **WHEN** 非管理员用户查看概览页
- **THEN** 统计卡集群计数 SHALL 与集群卡数据同口径（被分配集群）
- **AND** 最近创建的路由 SHALL 仅含可见集群的路由

#### Scenario: 节点三态摘要受限口径

- **WHEN** 具备 `nodes` 权限的非管理员查看节点摘要
- **THEN** 检测通过 / 未检测 / 检测失败三态数字 SHALL 仅统计被分配集群的节点，与失败明细卡同口径

## ADDED Requirements

### Requirement: 连接测试

系统 SHALL 验证与 Edge 节点的 Admin API 连通性，并在导入前展示节点基本信息。

#### Scenario: 连接成功
- **WHEN** 用户输入 Edge 节点 IP、端口和 API Key 并点击"测试连接"
- **THEN** 系统 SHALL 调用 Edge 节点 Admin API（`GET /apisix/admin/routes`）验证连通性
- **AND** 系统 SHALL 返回节点版本号、已安装插件数量、路由数量和上游数量
- **AND** 前端 SHALL 显示连接成功状态和节点概要信息

#### Scenario: 连接失败
- **WHEN** Edge 节点不可达、端口错误或 API Key 无效
- **THEN** 系统 SHALL 返回明确的错误信息（超时/拒绝连接/认证失败）
- **AND** 前端 SHALL 显示错误信息并允许用户修改参数后重新测试

### Requirement: 数据预览

系统 SHALL 在导入前展示 Edge 节点数据的预览，包括数据类型、数量和冲突检测结果。

#### Scenario: 展示预览数据
- **WHEN** 用户通过连接测试后进入预览阶段
- **THEN** 系统 SHALL 从 Edge 节点拉取 routes、upstreams、plugin_configs、global_rules 数据
- **AND** 系统 SHALL 将 APISIX 格式转换为磐石数据库格式
- **AND** 系统 SHALL 按数据类型分组展示预览结果（上游、路由、插件配置、全局规则）
- **AND** 前端 SHALL 可展开查看每种类型的详细条目列表

#### Scenario: 冲突检测
- **WHEN** 预览数据中存在与本地数据库冲突的记录
- **THEN** 系统 SHALL 检测以下冲突类型：
  - 上游名称冲突：已有同名上游但内容不同
  - 路由路径+方法冲突：已有相同 URI+methods 组合的路由
  - Edge UUID 冲突：已有相同 edge_uuid 的记录
- **AND** 系统 SHALL 在预览界面展示冲突列表，说明冲突类型和处理策略

### Requirement: 上游数据转换与导入

系统 SHALL 将从 Edge 节点拉取的上游数据转换为磐石格式并写入数据库。

#### Scenario: APISIX 上游转磐石上游
- **WHEN** Edge 节点返回 APISIX upstream 对象
- **THEN** 系统 SHALL 将 `type: roundrobin` 转换为 `load_balance: weighted_roundrobin`
- **AND** 系统 SHALL 将 `type: chash` 转换为 `load_balance: chash`
- **AND** 系统 SHALL 将 `type: least_conn` 转换为 `load_balance: least_conn`
- **AND** 系统 SHALL 将 `type: ewma` 转换为 `load_balance: ewma`

#### Scenario: Nodes 拆分为 Target 记录
- **WHEN** Edge 上游包含 `nodes` 字段（如 `{"10.0.0.1:80": 100}`）
- **THEN** 系统 SHALL 将每条 node 拆分为一条 `ps_upstream_target` 记录
- **AND** 目标地址格式保持 `ip:port` 字符串
- **AND** 权重从 node 的 value 值获取

#### Scenario: 上游名称冲突处理
- **WHEN** 导入的上游名称与数据库中已有的上游名称重复
- **THEN** 系统 SHALL 为新导入的上游名称追加 `-imported` 后缀
- **AND** 如果添加后缀后仍然冲突，则追加数字编号（如 `-imported-2`）
- **AND** 冲突处理细节 SHALL 记录到导入日志

#### Scenario: 保留 Edge UUID
- **WHEN** 导入上游时
- **THEN** 系统 SHALL 将 Edge 上游的 `id`（UUID 格式）写入 `ps_upstream.edge_uuid` 字段
- **AND** 后续路由导入可通过此 UUID 建立上下游关联

### Requirement: 路由数据转换与导入

系统 SHALL 将从 Edge 节点拉取的路由数据转换为磐石格式并写入数据库。

#### Scenario: 路由基础字段转换
- **WHEN** Edge 节点返回 APISIX route 对象
- **THEN** 系统 SHALL 将 `uri` 或 `uris` 写入 `ps_route.uri` 字段（多 URI 时取第一个）
- **AND** 系统 SHALL 将 `methods` 数组转换为逗号分隔字符串写入 `ps_route.methods`
- **AND** 系统 SHALL 将 `hosts` 数组转换为逗号分隔字符串写入 `ps_route.hosts`
- **AND** 系统 SHALL 将 `priority` 直接映射到 `ps_route.priority`
- **AND** 系统 SHALL 保留 Edge 路由的 `id`（UUID）写入 `ps_route.edge_uuid`

#### Scenario: 路由关联上游
- **WHEN** Edge 路由包含 `upstream_id`（UUID 引用）
- **THEN** 系统 SHALL 从已导入的 `ps_upstream` 中查找匹配 `edge_uuid` 的记录
- **AND** 如果找到，将 `ps_upstream.id` 写入 `ps_route.upstream_id`
- **AND** 如果未找到（该上游未导入），将 `ps_route.upstream_id` 设为 NULL

#### Scenario: 路由插件拆分
- **WHEN** Edge 路由包含 `plugins` 字段
- **THEN** 系统 SHALL 将每条插件配置写入一条 `ps_route_plugin` 记录
- **AND** `plugin_name` 字段记录插件名称（如 `limit-req`、`cors`）
- **AND** `config` 字段记录插件配置的 JSON 字符串

#### Scenario: 路由路径重名处理
- **WHEN** 导入的路由 URI+methods 组合与数据库中已有记录重复
- **THEN** 系统 SHALL 跳过该路由并记录到导入日志的冲突详情中
- **AND** 前端预览 SHALL 显示该路由将被跳过及原因

### Requirement: 插件配置导入

系统 SHALL 支持导入 Edge 节点的独立插件配置（plugin_configs）和全局规则（global_rules）。

#### Scenario: 导入插件配置
- **WHEN** Edge 节点返回 plugin_configs 数据
- **THEN** 系统 SHALL 将每条 plugin_config 写入 `ps_plugin_config` 表（如存在）
- **AND** 保留 `id`（UUID）用于路由引用

#### Scenario: 导入全局规则
- **WHEN** Edge 节点返回 global_rules 数据
- **THEN** 系统 SHALL 将每条全局规则写入 `ps_global_rule` 表（如存在）

### Requirement: 导入执行

系统 SHALL 在用户确认后执行数据导入，并反馈导入结果。

#### Scenario: 成功导入
- **WHEN** 用户确认导入所选数据
- **THEN** 系统 SHALL 按顺序导入：上游 → 路由 → 插件配置 → 全局规则
- **AND** 系统 SHALL 为 Edge 节点创建或更新 `ps_node` 记录并关联到所选集群
- **AND** 系统 SHALL 写入 `ps_import_log` 记录本次导入详情
- **AND** 前端 SHALL 显示导入成功，展示各类别导入数量

#### Scenario: 导入结果展示
- **WHEN** 导入完成
- **THEN** 前端 SHALL 显示汇总结果：
  - 成功导入：上游 N 个、路由 N 条、插件配置 N 个、全局规则 N 个
  - 已跳过：N 条（含原因）
  - 查看导入日志的链接

### Requirement: 导入日志

系统 SHALL 记录每次导入操作的详细日志，便于审计和追溯。

#### Scenario: 记录导入日志
- **WHEN** 导入操作完成（无论成功或失败）
- **THEN** 系统 SHALL 在 `ps_import_log` 表中创建一条记录
- **AND** 记录 SHALL 包含：所属集群、节点 IP 和端口、导入状态
- **AND** 记录 SHALL 包含：各类别导入数量、跳过数量和原因、错误信息（如果有）

#### Scenario: 查看导入历史
- **WHEN** 用户查看导入日志页面
- **THEN** 系统 SHALL 按时间倒序展示导入记录列表
- **AND** 每条记录 SHALL 展示：导入时间、节点、状态、导入数量摘要
- **AND** 用户 SHALL 可点击查看详情（冲突列表、错误信息）

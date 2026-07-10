## Purpose

Edge 节点数据导入功能，支持将已在运行（通过其他系统配置）的 PANSHI Edge 节点上的路由、上游、插件配置等数据，通过 Admin API 拉取并导入到磐石 Admin 数据库，使其纳入磐石的管理体系。
## Requirements
### Requirement: 连接测试

系统 SHALL 验证与 Edge 节点的 Admin API 连通性，并在导入前展示节点基本信息。

#### Scenario: 连接成功
- **WHEN** 用户输入 Edge 节点 IP、端口和 API Key 并点击"测试连接"
- **THEN** 系统 SHALL 调用 Edge 节点 Admin API（`GET /PANSHI/admin/routes`）验证连通性
- **AND** 系统 SHALL 返回节点版本号、已安装插件数量、路由数量和上游数量
- **AND** 前端 SHALL 显示连接成功状态和节点概要信息

#### Scenario: 连接失败
- **WHEN** Edge 节点不可达、端口错误或 API Key 无效
- **THEN** 系统 SHALL 返回明确的错误信息（超时/拒绝连接/认证失败）
- **AND** 前端 SHALL 显示错误信息并允许用户修改参数后重新测试

### Requirement: 数据预览

系统 SHALL 在导入前展示 Edge 节点数据的预览，包括数据类型、数量和冲突检测结果。

预览时单个资源类型获取失败 SHALL NOT 阻塞其他资源的预览展示。

#### Scenario: 展示预览数据
- **WHEN** 用户通过连接测试后进入预览阶段
- **THEN** 系统 SHALL 从 Edge 节点拉取 routes、upstreams、plugin_configs、global_rules、plugin_metadata、stream_proxies 数据
- **AND** 系统 SHALL 将 PANSHI 格式转换为磐石数据库格式
- **AND** 系统 SHALL 按数据类型分组展示预览结果
- **AND** 前端 SHALL 可展开查看每种类型的详细条目列表

#### Scenario: 单个资源获取失败不阻塞预览
- **WHEN** 从 Edge 节点获取某类资源失败（如接口不存在、超时等）
- **THEN** 该类资源 SHALL 在预览中显示为空
- **AND** 其他资源 SHALL 正常展示
- **AND** 后端 SHALL 记录错误日志到 `logs/app.log`
- **AND** 前端 SHALL 显示警告提示，列出哪些资源获取失败

#### Scenario: 冲突检测
- **WHEN** 预览数据中存在与本地数据库冲突的记录
- **THEN** 系统 SHALL 检测以下冲突类型：
  - 上游名称冲突：已有同名上游但内容不同
  - 路由路径+方法冲突：已有相同 URI+methods 组合的路由
  - Edge UUID 冲突：已有相同 edge_uuid 的记录
- **AND** 系统 SHALL 在预览界面展示冲突列表，说明冲突类型和处理策略

### Requirement: 上游数据转换与导入

系统 SHALL 将从 Edge 节点拉取的上游数据转换为磐石格式并写入数据库。

#### Scenario: PANSHI 上游转磐石上游
- **WHEN** Edge 节点返回 PANSHI upstream 对象
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

系统 SHALL 在导入路由时同时处理基础字段和高级匹配字段（`remote_addrs`、`vars`、`advanced_match_enabled`）。

**变更说明**: 在原有的 uri、methods、hosts、priority 转换基础上，增加 remote_addrs、vars、advanced_match_enabled 三个高级匹配字段的导入支持。

#### Scenario: 路由基础字段转换

- **WHEN** Edge 节点返回 PANSHI route 对象
- **THEN** 系统 SHALL 将 `uri` 或 `uris` 写入 `ps_route.uri` 字段（多 URI 时取第一个）
- **AND** 系统 SHALL 将 `methods` 数组转换为逗号分隔字符串写入 `ps_route.methods`
- **AND** 系统 SHALL 将 `hosts` 数组转换为逗号分隔字符串写入 `ps_route.hosts`
- **AND** 系统 SHALL 将 `priority` 直接映射到 `ps_route.priority`
- **AND** 系统 SHALL 保留 Edge 路由的 `id`（UUID）写入 `ps_route.edge_uuid`

#### Scenario: 导入高级匹配字段

- **WHEN** Edge 路由包含 `remote_addrs` 字段（客户端 IP 地址列表）
- **THEN** 系统 SHALL 将 `remote_addrs` 数组转换为逗号分隔字符串写入 `ps_route.remote_addrs`
- **AND** 系统 SHALL 将 `vars` 数组（高级匹配条件表达式）序列化为 JSON 字符串写入 `ps_route.vars`
- **AND** 系统 SHALL 当 `vars` 为非空数组时将 `ps_route.advanced_match_enabled` 设为 1，否则为 0

#### Scenario: 路由预览展示高级匹配信息

- **WHEN** 用户查看导入预览中的路由列表
- **THEN** 系统 SHALL 展示该路由的 `vars` 和 `remote_addrs` 信息

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


## ADDED Requirements

### Requirement: 数据导入功能受特性配置控制

Edge 数据导入功能 SHALL 受 `features.yaml` 中 `edge_import` 特性控制。

#### Scenario: 数据导入启用
- **WHEN** `features.yaml` 中 `edge_import` 为 `true`
- **THEN** `/edge-import` 路由 SHALL 注册
- **AND** 侧边栏数据导入菜单项 SHALL 显示
- **AND** 后端 `/api/v1/edge-import/*` 端点 SHALL 可用

#### Scenario: 数据导入禁用
- **WHEN** `features.yaml` 中 `edge_import` 为 `false`
- **THEN** `/edge-import` 路由 SHALL NOT 注册
- **AND** 侧边栏数据导入菜单项 SHALL NOT 显示
- **AND** 后端所有 `/api/v1/edge-import/*` 端点 SHALL 返回 404

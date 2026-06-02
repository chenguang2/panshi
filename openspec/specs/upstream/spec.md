## Purpose

上游服务管理负载均衡算法配置，支持发布到边缘节点。

## Requirements

### Requirement: 上游负载均衡类型
上游服务 SHALL 支持四种负载均衡算法：加权轮询（weighted_roundrobin）、一致性哈希（chash）、延迟最小（ewma）和最少连接（least_conn）。

#### Scenario: 选择加权轮询模式
- **WHEN** 用户创建上游时选择负载均衡类型为"加权轮询"
- **THEN** 系统 SHALL 保存负载均衡值为 `weighted_roundrobin`
- **AND** 发布到边缘节点时 SHALL 转换为 `type: roundrobin`

#### Scenario: 选择一致性哈希模式
- **WHEN** 用户创建上游时选择负载均衡类型为"一致性哈希"
- **THEN** 系统 SHALL 保存负载均衡值为 `chash`
- **AND** 发布到边缘节点时 SHALL 转换为 `type: chash`
- **AND** SHALL 包含 `hash_on` 和 `key` 字段

#### Scenario: 选择延迟最小模式
- **WHEN** 用户创建上游时选择负载均衡类型为"延迟最小"
- **THEN** 系统 SHALL 保存负载均衡值为 `ewma`
- **AND** 发布到边缘节点时 SHALL 转换为 `type: ewma`

#### Scenario: 选择最少连接模式
- **WHEN** 用户创建上游时选择负载均衡类型为"最少连接"
- **THEN** 系统 SHALL 保存负载均衡值为 `least_conn`
- **AND** 发布到边缘节点时 SHALL 转换为 `type: least_conn`

#### Scenario: 一致性哈希发布时传递哈希配置
- **WHEN** 上游负载均衡类型为 `chash` 且用户设置了 hash_on 和 key
- **THEN** 发布到边缘节点时 SHALL 包含 `hash_on` 字段（默认值 "vars"）
- **AND** SHALL 包含 `key` 字段
- **AND** hash_on 有效值为 `vars`, `header`, `cookie`, `vars_combinations`

### Requirement: 哈希位置字段命名
哈希位置字段 SHALL 统一命名为 `hash_on`，替代原有的 `hash_location`。

#### Scenario: 创建一致性哈希上游
- **WHEN** 用户创建 chash 类型上游并设置哈希位置
- **THEN** 系统 SHALL 使用字段名 `hash_on` 保存哈希位置类型
- **AND** 使用字段名 `key` 保存哈希 key 值

### Requirement: 哈希 Key 格式要求
当 hash_on 为 `vars` 时，key 值必须符合 Nginx 变量格式。

#### Scenario: vars 模式的 key 验证
- **WHEN** hash_on 为 `vars` 时
- **THEN** key 必须是有效的 Nginx 内置变量（如 `uri`, `remote_addr`）或 `arg_xxx` 格式的 URL 参数
- **AND** 边缘节点（PANSHI）会验证 key 格式，不合法则拒绝

### Requirement: 已废弃的负载均衡类型
以下负载均衡类型已被移除：iphash、leastconn、weightedroundrobin（拼写错误）。

#### Scenario: 旧数据迁移
- **WHEN** 数据库中存在旧的负载均衡类型值
- **THEN** 系统 SHALL 迁移 `weightedroundrobin` → `weighted_roundrobin`
- **AND** 迁移 `consistent_hash` → `chash`（如存在）

### Requirement: 删除上游同步到 Edge 节点
删除上游时 SHALL 从数据库删除记录，并同步从集群中所有活跃 Edge 节点删除。

#### Scenario: 成功删除上游
- **WHEN** 用户删除一个上游
- **THEN** 系统 SHALL 从数据库删除上游记录
- **AND** SHALL 调用所有活跃 Edge 节点的 DELETE API 删除该上游
- **AND** SHALL 返回每个节点的删除结果

#### Scenario: 部分节点不可达
- **WHEN** 删除上游时部分 Edge 节点不可达
- **THEN** 系统 SHALL 仍从数据库删除记录
- **AND** SHALL 返回包含成功和失败节点的结果列表
## MODIFIED Requirements

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

### Requirement: 一致性哈希发布时传递哈希配置
当上游负载均衡类型为 `chash` 且用户设置了 hash_on 和 key。

#### Scenario: 一致性哈希发布时传递哈希配置
- **WHEN** 上游负载均衡类型为 `chash` 且用户设置了 hash_on 和 key
- **THEN** 发布到边缘节点时 SHALL 包含 `hash_on` 字段（默认值 "vars"）
- **AND** SHALL 包含 `key` 字段
- **AND** hash_on 有效值为 `vars`, `header`, `cookie`, `vars_combinations`

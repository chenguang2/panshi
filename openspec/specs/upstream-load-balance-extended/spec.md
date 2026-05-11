## Purpose

扩展上游负载均衡算法，在原有加权轮询和一致性哈希基础上新增延迟最小和最少连接。

## Requirements

### Requirement: 上游负载均衡支持延迟最小算法
上游负载均衡 SHALL 支持 `ewma`（延迟最小）算法，选择延迟最小的节点。

#### Scenario: 选择延迟最小模式
- **WHEN** 用户创建上游时选择负载均衡类型为"延迟最小"
- **THEN** 系统 SHALL 保存负载均衡值为 `ewma`
- **AND** 发布到边缘节点时 SHALL 包含 `type: ewma`

### Requirement: 上游负载均衡支持最少连接算法
上游负载均衡 SHALL 支持 `least_conn`（最少连接）算法，选择活动连接数最少的节点。

#### Scenario: 选择最少连接模式
- **WHEN** 用户创建上游时选择负载均衡类型为"最少连接"
- **THEN** 系统 SHALL 保存负载均衡值为 `least_conn`
- **AND** 发布到边缘节点时 SHALL 包含 `type: least_conn`

### Requirement: 新增算法在下拉框中位置
`ewma` 和 `least_conn` SHALL 放置在负载均衡下拉框的最后（一致性哈希之后），标记为不常用选项。

#### Scenario: 下拉框排序
- **WHEN** 用户打开负载均衡下拉框
- **THEN** 加权轮询和一致性哈希 SHALL 显示在前
- **AND** 延迟最小和最少连接 SHALL 显示在后

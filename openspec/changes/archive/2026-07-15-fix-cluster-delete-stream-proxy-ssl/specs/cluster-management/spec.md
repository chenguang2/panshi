## MODIFIED Requirements

### Requirement: 集群资源统计

系统 SHALL 在集群统计信息中包含四层代理和 SSL 证书的数量。

#### Scenario: 统计包含四层代理和 SSL
- **WHEN** 调用 `GET /clusters/{cluster_id}/stats`
- **THEN** 返回的 JSON SHALL 包含 `stream_proxies` 和 `ssl_certificates` 字段
- **AND** 值 SHALL 为对应集群下该类型资源的数量

### Requirement: 删除集群清理关联资源

系统 SHALL 在删除集群时清理四层代理和 SSL 证书。

#### Scenario: Edge 侧删除
- **WHEN** 用户选择「从 Edge 节点删除」后确认删除集群
- **THEN** 系统 SHALL 遍历并删除集群下的四层代理和 SSL 证书
- **AND** 删除失败 SHALL NOT 阻塞其他资源的删除

#### Scenario: DB 侧删除
- **WHEN** 用户选择「从数据库删除」后确认删除集群
- **THEN** 系统 SHALL 删除该集群下所有四层代理和 SSL 证书的数据库记录

### Requirement: 前端资源标签

前端 SHALL 在删除确认弹窗的资源列表中显示四层代理和 SSL 证书的中文标签。

#### Scenario: 显示标签
- **WHEN** 用户点击删除集群弹窗展示资源清单
- **THEN** 列表中 SHALL 显示「四层代理」和「SSL 证书」及其数量

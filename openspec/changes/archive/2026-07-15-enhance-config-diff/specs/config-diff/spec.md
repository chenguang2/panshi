## MODIFIED Requirements

### Requirement: 插件元数据配置对比

系统 SHALL 在对比插件元数据配置时忽略 Edge 服务端自动注入的 `id` 字段，忽略规则通过 `equivalence_rules.yaml` 配置。

#### Scenario: 忽略 id 字段
- **WHEN** Edge 节点返回的插件元数据配置中包含 `"id": "plugin_name"` 字段
- **THEN** 系统 SHALL 根据 `equivalence_rules.yaml` 中 `plugin_metadata.ignore_edge_fields` 配置移除该字段
- **AND** 该字段差异 SHALL NOT 标记为配置差异

### Requirement: 新增 EdgeClient.list_ssl() 方法

系统 SHALL 在 EdgeClient 中新增 `list_ssl()` 方法，统一 SSL 证书列表的获取方式。

#### Scenario: 调用 list_ssl
- **WHEN** 调用 `client.list_ssl()`
- **THEN** 系统 SHALL 调用 `client.api("ssl", "list")`
- **AND** 返回 Edge 节点上的 SSL 证书列表

### Requirement: SSL 证书配置对比

系统 SHALL 在节点配置对比中包含 SSL 证书的 DB 与 Edge 差异分析。

#### Scenario: SSL 证书对比
- **WHEN** 用户查看节点配置对比结果
- **THEN** 结果中 SHALL 包含「SSL 证书」分组
- **AND** 系统 SHALL 逐字段对比：name、sni（归一化后）、cert_type、cert、private_key、status
- **AND** DB 和 Edge 数据均以 edge_uuid 匹配

#### Scenario: SNI 格式兼容
- **WHEN** Edge 返回的 SSL 数据中 `sni` 为字符串或 `snis` 为数组
- **THEN** 系统 SHALL 归一化为逗号分隔字符串后与 DB 对比
- **AND** 归一化过程 SHALL NOT 修改原始数据

#### Scenario: Edge SSL 拉取失败
- **WHEN** 从 Edge 节点拉取 SSL 数据失败（接口不可用、超时等）
- **THEN** 系统 SHALL 仅标记 DB 中存在的 SSL 证书为 `only_in_db`
- **AND** 其他资源的对比 SHALL NOT 受影响

#### Scenario: cert/private_key 对比可行
- **WHEN** 对比 cert 和 private_key 字段
- **THEN** 系统 SHALL 直接对比 DB 明文与 Edge 返回的解密后明文
- **AND** 两值应当一致（除非证书在 Edge 侧被修改）

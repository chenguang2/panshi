## ADDED Requirements

### Requirement: 插件组发布记录 Edge 操作日志

发布插件组时，对每个活跃 Edge 节点的 API 调用 SHALL 记录到 `logs/edge/plugin_config.log` 文件中。

#### Scenario: 插件组全部成功
- **WHEN** 发布插件组且所有节点同步成功
- **THEN** 每条成功记录包含：时间戳、集群信息、插件组名称、请求方法/PATH、请求体、加密体、响应状态码、响应体、Status: SUCCESS

#### Scenario: 插件组部分节点失败
- **WHEN** 发布插件组且部分节点同步失败
- **THEN** 成功节点记录 Status: SUCCESS，失败节点记录 Status: FAILED 并包含错误信息

### Requirement: 全局规则发布记录 Edge 操作日志

发布全局规则时，对每个活跃 Edge 节点的 API 调用 SHALL 记录到 `logs/edge/global_rule.log` 文件中。

#### Scenario: 全局规则发布同步
- **WHEN** 发布全局规则到 Edge 节点
- **THEN** 每个节点的操作记录包含：时间戳、集群信息、规则名称、请求方法/PATH、请求体、响应状态码、Status: SUCCESS 或 FAILED

### Requirement: 插件元数据发布记录 Edge 操作日志

发布插件元数据时，对每个活跃 Edge 节点的 API 调用 SHALL 记录到 `logs/edge/plugin_metadata.log` 文件中。

#### Scenario: 插件元数据发布同步
- **WHEN** 发布插件元数据到 Edge 节点
- **THEN** 每个节点的操作记录包含：时间戳、集群信息、插件名称、请求方法/PATH、请求体、响应状态码、Status: SUCCESS 或 FAILED

## MODIFIED Requirements

### Requirement: 路由数据转换与导入

系统 SHALL 在导入路由时同时处理基础字段和高级匹配字段（`remote_addrs`、`vars`、`advanced_match_enabled`）。

**变更说明**: 在原有的 uri、methods、hosts、priority 转换基础上，增加 remote_addrs、vars、advanced_match_enabled 三个高级匹配字段的导入支持。

#### Scenario: 路由基础字段转换

- **WHEN** Edge 节点返回 APISIX route 对象
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

# cluster-plugin-groups Delta

## MODIFIED Requirements

### Requirement: 插件组 CRUD
系统 SHALL 支持对插件组进行增删改查操作，插件组存储在本地数据库，包含名称、描述、插件配置。删除插件组前 SHALL 校验路由引用：插件组的 `edge_uuid` 仍被本集群任一路由的 `plugin_config_ids` 引用时，删除请求 MUST 在任何删除动作前被拒绝（PLG-07）。

#### Scenario: 创建插件组
- **WHEN** 用户填写名称、描述，并选择插件配置
- **THEN** 系统 SHALL 保存到本地数据库，并返回创建后的记录

#### Scenario: 更新插件组
- **WHEN** 用户修改插件组的名称、描述或插件配置
- **THEN** 系统 SHALL 更新数据库记录

#### Scenario: 删除插件组
- **WHEN** 用户删除一个插件组，且其 `edge_uuid` 未被本集群任何路由的 `plugin_config_ids` 引用（畸形 JSON 引用按「不含引用」处理）
- **THEN** 系统 SHALL 从数据库删除，并尝试从 Edge 节点删除

#### Scenario: 删除被路由引用的插件组被拒绝
- **WHEN** 删除请求带 delete_db=true 且该插件组仍被本集群任一路由的 `plugin_config_ids` 引用
- **THEN** 系统 SHALL 返回 400 并列出引用该组的路由（至多 3 条 + 等）
- **AND** 数据库记录与 Edge 侧配置 SHALL 均不被删除（与 SSL CA 删除守卫同款行为）

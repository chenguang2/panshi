## Purpose

集群级别的插件组管理，允许用户创建可复用的插件配置集合，并通过发布同步到 Edge 节点。

## Requirements

### Requirement: 插件组 CRUD
系统 SHALL 支持对插件组进行增删改查操作，插件组存储在本地数据库，包含名称、描述、插件配置。

#### Scenario: 创建插件组
- **WHEN** 用户填写名称、描述，并选择插件配置
- **THEN** 系统 SHALL 保存到本地数据库，并返回创建后的记录

#### Scenario: 更新插件组
- **WHEN** 用户修改插件组的名称、描述或插件配置
- **THEN** 系统 SHALL 更新数据库记录

#### Scenario: 删除插件组
- **WHEN** 用户删除一个插件组
- **THEN** 系统 SHALL 从数据库删除，并尝试从 Edge 节点删除

### Requirement: 插件组发布到 Edge 节点
系统 SHALL 支持将插件组发布到集群中的所有活跃 Edge 节点。

#### Scenario: 发布插件组
- **WHEN** 用户点击发布按钮
- **THEN** 系统 SHALL 遍历活跃 Edge 节点调用 PUT /edge/admin/plugin_configs/{uuid}
- **AND** 返回每个节点的发布结果

### Requirement: 插件组卡片展示
系统 SHALL 以卡片形式展示插件组，每个卡片展示名称、描述、插件标签、发布状态。

#### Scenario: 查看插件组
- **WHEN** 用户切换到"插件组"Tab
- **THEN** 系统 SHALL 以卡片网格展示所有插件组
- **AND** 每张卡片内显示该组包含的所有插件名称标签

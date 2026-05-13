## ADDED Requirements

### Requirement: 全局规则 CRUD
系统 SHALL 支持对全局规则进行增删改查操作。

#### Scenario: 创建全局规则
- **WHEN** 用户填写名称、描述，并选择插件
- **THEN** 系统 SHALL 保存到本地数据库

### Requirement: 全局规则发布
系统 SHALL 支持将全局规则发布到集群 Edge 节点。

#### Scenario: 发布全局规则
- **WHEN** 用户点击发布
- **THEN** 系统 SHALL 调用 PUT /edge/admin/global_rules/{uuid}

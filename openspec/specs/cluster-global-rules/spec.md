## Purpose

全局规则管理，允许用户创建可复用的全局规则，通过发布同步到 Edge 节点。
## Requirements
### Requirement: 全局规则卡片提供查看详情功能

系统 SHALL 在全局规则卡片操作栏提供"查看"按钮，点击后以只读抽屉展示全局规则详情。

#### Scenario: 查看全局规则详情
- **WHEN** 用户点击全局规则卡片的"查看"按钮（EyeOutlined 图标）
- **THEN** 系统 SHALL 打开抽屉展示全局规则信息
- **AND** 展示名称、描述、发布状态、版本号
- **AND** 展示该全局规则包含的所有插件配置 JSON

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

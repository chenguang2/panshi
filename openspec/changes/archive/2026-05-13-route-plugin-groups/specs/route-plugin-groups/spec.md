## ADDED Requirements

### Requirement: 路由关联插件组
系统 SHALL 支持路由关联多个插件组，关联的插件组配置将与路由独立插件配置合并后生效。

#### Scenario: 路由弹窗显示插件组
- **WHEN** 用户添加或编辑路由
- **THEN** 路由弹窗 SHALL 包含"插件组"Tab
- **AND** SHALL 以卡片形式展示所有可用插件组

#### Scenario: 选择插件组
- **WHEN** 用户勾选插件组
- **THEN** 存盘时 SHALL 保存 `plugin_config_ids` 到数据库
- **AND** 发布时 SHALL 将 `plugin_config_ids` 发送到 Edge 节点

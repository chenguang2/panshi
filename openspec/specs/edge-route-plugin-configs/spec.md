# Edge Route Plugin Configs

## Purpose

定义边缘节点直接管理页面中，路由编辑时插件组（plugin_configs）的选择与提交行为。

## Requirements

### Requirement: Edge route edit form SHALL support plugin_config selection

When editing or creating a route in the edge node direct management page, the form SHALL display available plugin configs (plugin groups) and allow selecting/deselecting them.

#### Scenario: Plugin configs are displayed in route edit modal
- **WHEN** the route edit modal is opened (create or edit mode)
- **THEN** all available plugin configs from `pluginConfigs` SHALL be displayed as selectable cards
- **AND** each card SHALL show the plugin config name, version, and included plugin tags

#### Scenario: Edit mode pre-selects existing plugin_config_ids
- **WHEN** editing an existing route that has `plugin_config_ids`
- **THEN** the form SHALL pre-select the corresponding plugin config cards
- **AND** `routeForm.plugin_config_ids` SHALL be initialized from `record.value.plugin_config_ids`

#### Scenario: Plugin config selection is included in create/update payload
- **WHEN** submitting the route form (create or update)
- **AND** `routeForm.plugin_config_ids` is non-empty
- **THEN** the API payload SHALL include `plugin_config_ids` field with the selected UUIDs

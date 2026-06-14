# plugin-switch-management — Delta Spec

## ADDED Requirements

### Requirement: 插件开关功能受特性配置控制

插件开关管理页面 SHALL 受 `features.yaml` 中 `plugin_switches` 特性控制。

#### Scenario: 插件开关启用
- **WHEN** `features.yaml` 中 `plugin_switches` 为 `true`
- **THEN** `/plugin-switches` 路由 SHALL 注册
- **AND** 系统管理分区的"插件开关"菜单项 SHALL 显示
- **AND** 后端 `GET/PUT /api/v1/plugin-switches` 端点 SHALL 可用

#### Scenario: 插件开关禁用
- **WHEN** `features.yaml` 中 `plugin_switches` 为 `false`
- **THEN** `/plugin-switches` 路由 SHALL NOT 注册
- **AND** 系统管理分区的"插件开关"菜单项 SHALL NOT 显示
- **AND** 后端 `GET/PUT /api/v1/plugin-switches` 端点 SHALL 返回 404
- **AND** 插件的 DB 级 `ps_plugin_enabled` 表仍然存在，但仅通过配置文件白名单（`enabled_plugins`）间接控制插件可见性

### Requirement: 插件开关管理页面受配置文件白名单约束

插件开关管理页面 SHALL 尊重 `features.yaml` 中的 `enabled_plugins` 白名单。即使 `all=1` 参数也无法绕过配置文件限制。

#### Scenario: 管理页面只显示白名单内的插件
- **WHEN** `features.yaml` 中 `enabled_plugins` 为 `["proxy_rewrite", "cors", "key_auth"]`
- **AND** 管理员访问插件开关管理页面
- **THEN** 页面 SHALL 仅显示 `proxy_rewrite`、`cors`、`key_auth` 三个插件的开关
- **AND** 其他插件的开关 SHALL NOT 出现
- **AND** 管理员无法启用/禁用不在白名单中的插件

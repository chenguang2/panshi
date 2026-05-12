## Purpose

路由插件配置定义，为前端插件选择器提供 schema。

## Requirements

### Requirement: 路由插件配置从后端 API 加载
前端 SHALL 从 `/api/v1/plugins/builtin` 加载插件列表和 schema。

#### Scenario: 加载插件列表
- **WHEN** 前端打开路由插件配置页面
- **THEN** 系统 SHALL 显示 7 个可用插件及其配置 schema

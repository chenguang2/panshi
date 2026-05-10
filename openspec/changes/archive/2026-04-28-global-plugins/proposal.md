## Why

APISIX 支持在集群级别配置全局插件（Global Plugins），这些插件在整个集群的所有路由共享。当前系统仅支持路由级别的插件管理，缺少全局插件的 UI 管理界面。用户需要通过表单或 JSON 方式配置全局插件的 metadata，并支持发布和版本管理。

## What Changes

**新增功能：**
- 在集群卡片中新增"全局插件" Tab 页
- 全局插件列表展示（名称、描述、配置状态）
- 添加/编辑全局插件（Form 模式 + JSON 模式切换）
- 全局插件发布功能（同步到 APISIX）
- 全局插件版本管理（历史版本查看、回滚）
- 全局插件列配置（可选择显示哪些列）
- 全局插件搜索功能

**参考实现：**
- APISIX Admin API 的 `/plugins` 和 `/plugins/{plugin_name}` 接口
- 现有路由管理的插件管理功能（PluginSelector 组件）
- 现有上游/路由的 Form/JSON 双模式编辑器

## Capabilities

### New Capabilities
- `global-plugins`: 全局插件管理功能
  - 前端：`ClusterList.vue` 新增 global-plugins Tab 和 GlobalPluginSelector 组件
  - 后端：新增 `/clusters/{cluster_id}/plugins` API 端点（如果不存在）

### Modified Capabilities
- `cluster-management`: 集群管理增加全局插件 Tab 页

## Impact

- `frontend/src/views/ClusterList.vue` - 新增全局插件 Tab 和相关逻辑
- `frontend/src/components/GlobalPluginSelector.vue` - 新建全局插件选择器组件（复用 PluginSelector 逻辑）
- `backend/app/api/v1/cluster.py` 或新建 `plugins.py` - 新增集群插件 API

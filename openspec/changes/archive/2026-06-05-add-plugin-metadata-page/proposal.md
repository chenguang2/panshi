## Why

插件元数据（PluginMetadata）目前只能在集群详情页内管理，不支持跨集群统一查看和管理。需要提供一个独立的插件元数据管理页面，方便用户在不同集群间切换管理插件配置，降低操作路径。

## What Changes

- 新增独立插件元数据管理页面，入口在侧边栏"核心功能"区域
- 页面采用双栏布局（左栏可用插件 / 右栏已配置插件），复用现有 `PluginMetadata.vue` 组件
- 顶部 `PageHeader` 带集群选择器，选集群后渲染双栏组件
- 不修改后端 API（复用已有的 `/clusters/{cluster_id}/plugin-metadata/*` 和 `/plugins/builtin`）

## Capabilities

### New Capabilities
- `plugin-metadata-management`: 独立插件元数据管理页面，包括跨集群切换、可用插件浏览、已配置插件 CRUD、发布、版本管理、删除

### Modified Capabilities
- 无（不修改现有功能）

## Impact

- 前端新增：`frontend/src/views/PluginMetadataList.vue`
- 前端修改：`frontend/src/router/index.ts`（加路由）、`frontend/src/components/AppSidebar.vue`（加侧边栏入口）
- 后端无变更
- 无新依赖

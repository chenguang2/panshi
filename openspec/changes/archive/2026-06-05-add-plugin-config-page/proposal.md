## Why

插件组管理目前只能在集群管理页面内作为子 tab 操作，缺少独立的插件组主页。设计稿 `docs/ui/Live-Artifact-4/plugin-configs.html` 提供了独立的插件组管理页面。

## What Changes

- **新增页面** `frontend/src/views/PluginConfigList.vue` — 独立的插件组管理主页
- **侧边栏** 在「核心功能」区增加「插件组」菜单项
- **路由** 新增 `/plugin-configs` 路由
- **布局**：卡片网格（CSS Grid），每张卡片显示名称、描述、插件标签、操作按钮
- **筛选**：集群下拉框（"全部集群"代替"选择集群"）+ 搜索框 + 计数
- **添加/编辑插件组**：提取 `PluginConfigFormModal.vue` 共享组件，加所属集群字段
- **卡片操作按钮**：查看、编辑、删除、发布、版本管理（全部复用集群管理中对应的功能）
- **后端**：新增 `GET /api/v1/plugin_configs` 跨集群接口

## Impact

- `frontend/src/views/PluginConfigList.vue` — 新增
- `frontend/src/components/PluginConfigFormModal.vue` — 新增（共享表单组件）
- `frontend/src/router/index.ts` — 新增路由
- `frontend/src/components/AppSidebar.vue` — 新增菜单项
- `backend/app/api/v1/plugin_configs.py` — 新增（跨集群 API）

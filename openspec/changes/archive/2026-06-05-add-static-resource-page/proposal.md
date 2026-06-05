## Why

静态资源管理目前只能在集群管理页面内作为子 tab 操作，缺少独立的静态资源主页。设计稿 `docs/ui/Live-Artifact-4/static-resources.html` 提供了独立的静态资源管理页面。

## What Changes

- **新增页面** `frontend/src/views/StaticResourceList.vue` — 独立的静态资源管理主页
- **侧边栏** 在「核心功能」区增加「静态资源」菜单项
- **路由** 新增 `/static-resources` 路由
- **布局**：卡片网格（CSS Grid），每张卡片显示名称、路径、描述、文件统计、操作按钮
- **筛选**：集群下拉框（"全部集群"）+ 搜索框 + 计数
- **添加/编辑**：提取 `StaticResourceFormModal.vue` 共享组件，加所属集群字段
- **卡片操作按钮**：上传、发布、删除、版本管理（和集群管理一致）
- **后端**：新增 `GET /api/v1/static_resources` 跨集群接口

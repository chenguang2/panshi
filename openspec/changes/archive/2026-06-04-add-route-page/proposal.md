## Why

路由管理目前只能在集群管理页面内作为子 tab 操作，缺少独立的路由列表主页。设计稿 `docs/ui/Live-Artifact-4/routes.html` 提供了独立的路由管理页面。

## What Changes

- **新增页面** `frontend/src/views/RouteList.vue` — 独立的路由管理主页
- **侧边栏** 在「核心功能」区增加「路由管理」菜单项
- **路由** 新增 `/routes` 路由
- **筛选栏**：HTTP 方法 chip 筛选 + 搜索 + 集群筛选 + 发布状态下拉
- **表格列**：名称/描述、URI、方法、集群、优先级、版本、创建时间、操作
- **去掉**「发布全部」按钮
- **去掉**状态列，改为「版本」列
- **去掉**全部状态下拉，改为「发布状态」（已发布/未发布）
- **新建路由**：复用 `useClusterRoutes` 逻辑，提取 `RouteFormModal.vue` 共享组件，加所属集群字段
- **操作菜单**：复制路由、编辑、发布、版本管理、删除（无禁用）
- **编辑**：复用 `useClusterRoutes` 逻辑，使用 RouteFormModal
- **复制路由**：复用 `useClusterRoutes` 的复制功能
- **删除**：调用 `useClusterRoutes` 的删除
- **发布**：调用 `useClusterRoutes` 的发布
- **版本管理**：调用 `useClusterRoutes` 的版本管理

## Impact

- `frontend/src/views/RouteList.vue` — 新增
- `frontend/src/components/RouteFormModal.vue` — 新增（共享表单组件）
- `frontend/src/router/index.ts` — 新增路由
- `frontend/src/components/AppSidebar.vue` — 新增菜单项
- 参考 `UpstreamList.vue` 的实现模式

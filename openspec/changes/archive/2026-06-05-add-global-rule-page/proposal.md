## Why

全局规则管理目前只能在集群管理页面内作为子 tab 操作，缺少独立的全局规则主页。设计稿 `docs/ui/Live-Artifact-4/global-rules.html` 提供了独立的全局规则管理页面。实现方式和插件组完全一致。

## What Changes

- **新增页面** `frontend/src/views/GlobalRuleList.vue` — 独立的全局规则管理主页
- **侧边栏** 在「核心功能」区增加「全局规则」菜单项
- **路由** 新增 `/global-rules` 路由
- **布局**：卡片网格（CSS Grid），每张卡片显示名称、描述、插件标签、操作按钮
- **筛选**：集群下拉框（"全部集群"）+ 搜索框 + 计数
- **添加/编辑**：提取 `GlobalRuleFormModal.vue` 共享组件，加所属集群字段
- **卡片操作按钮**：查看、编辑、删除、发布、版本管理（和插件组完全一致）
- **后端**：新增 `GET /api/v1/global_rules` 跨集群接口

## Impact

- `frontend/src/views/GlobalRuleList.vue` — 新增
- `frontend/src/components/GlobalRuleFormModal.vue` — 新增
- `frontend/src/router/index.ts` — 新增路由
- `frontend/src/components/AppSidebar.vue` — 新增菜单项
- `backend/app/api/v1/global_rules.py` — 新增

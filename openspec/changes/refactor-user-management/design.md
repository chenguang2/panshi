## Context

当前 UserList.vue 使用 Ant Design Table + Modal 实现，功能较基础，缺少筛选、权限网格、操作菜单等设计稿中的核心交互。本次重构以 design sample `users.html` 为准，完全重写该页面。

## Goals / Non-Goals

**Goals:**
- 按 users.html 设计稿完全重写 UserList.vue
- 保留现有后端 API 调用逻辑（`/admin/users`、`/admin/users/${id}/permissions`）
- 使用现有的通用组件（PageHeader、TableCard、BadgeStatus）

**Non-Goals:**
- 不改动后端代码和 API
- 不改动权限系统的后端逻辑
- 不改动其他页面

## Decisions

### Decision 1：操作菜单使用自定义下拉组件

**选择**：不使用 Ant Design Dropdown，使用纯 CSS 实现的三点菜单按钮 + 弹出层。

**理由**：设计稿中操作按钮是三点（⋯）符号，点击后弹出竖排菜单。Ant Design Dropdown 也可以实现但需要额外的样式覆盖。自定义实现更轻量且完全匹配设计稿的视觉。

### Decision 2：权限数据模型使用后端已有 key

**选择**：权限网格直接使用后端已有的 4 个权限 key，放弃设计稿中无后端映射的权限项。

**后端权限 key**：
- `plugin_groups` — 插件组管理
- `global_rules` — 全局规则管理
- `edge_nodes` — 边缘节点管理
- `plugin_management` — 插件管理

**理由**：设计稿中的 `route/upstream/cluster/user` 等权限在后端无对应存储，勾选后不会持久化，会误导用户。直接使用后端已验证的权限模型更可靠。

### Decision 3：筛选/分页全部前端完成

**选择**：搜索、角色筛选、状态筛选、分页全部在前端完成。

**理由**：用户管理页面用户数通常在几十以内，一次性拉取全部数据后在前端做过滤和分页，实现简单且交互流畅。

### Decision 4：移除集群权限选择器

**选择**：不实现设计稿中的集群权限标签选择器。

**理由**：后端没有集群级别的权限模型，`UserPermission` 表只存储 `resource_type` 级别的权限字符串，不支持按集群 ID 授权。前端单独维护集群权限状态无法持久化。

## Risks

- 权限模型映射可能不完全匹配后端功能 → 后端不做改动，前端尽量兼容

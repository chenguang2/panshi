## Why

用户管理页面重构后存在 4 处与设计稿不符的 Bug：筛选栏换行错乱、权限列标签不显示、缺少可访问集群列、操作下拉菜单被表格裁剪。

## What Changes

- **Bug 1 - 筛选栏布局**：删除 `flex-wrap` 确保搜索/角色/状态/计数始终在一行
- **Bug 2 - 权限列标签**：从 API 加载用户权限数据并渲染为标签
- **Bug 3 - 缺少可访问集群列**：添加「可访问集群」列，显示用户可操作的集群名称
- **Bug 4 - 操作菜单裁剪**：TableCard 的 `overflow: hidden` 改为 `overflow: visible`，使下拉菜单不被裁剪

## Capabilities

### New Capabilities
（均为 Bug 修复，无新能力）

## Impact

- `frontend/src/views/UserList.vue` — 修复筛选栏、权限列、集群列、菜单裁剪
- `frontend/src/components/TableCard.vue` — `overflow: hidden` → `overflow: visible`（修复菜单裁剪）

## Context

当前菜单结构：仪表盘、用户管理、集群管理、字典管理平级显示。集群管理使用 ant-design 表格组件展示。

**问题：**
1. 菜单缺少层级组织，用户管理和字典管理应该属于"系统管理"
2. 集群管理表格样式不够直观
3. 普通用户可以查看所有集群，存在权限问题

## Goals / Non-Goals

**Goals:**
- 将用户管理和字典管理放入"系统管理"子菜单
- 集群管理改为卡片样式展示
- 普通用户只能看到自己创建的集群

**Non-Goals:**
- 不修改现有的认证授权机制
- 不修改集群的 CRUD API 端点
- 不修改字典管理的功能逻辑

## Decisions

### 1. 菜单结构

**决策：** 使用 ant-design-vue 的 `a-sub-menu` 实现二级菜单

```vue
<a-menu-item key="dashboard">仪表盘</a-menu-item>
<a-sub-menu key="system" title="系统管理">
  <a-menu-item key="users">用户管理</a-menu-item>
  <a-menu-item key="dictionaries">字典管理</a-menu-item>
</a-sub-menu>
<a-menu-item key="clusters">集群管理</a-menu-item>
```

### 2. 集群卡片样式

**决策：** 使用 ant-design-vue 的 `a-card` 组件替代 `a-table`

卡片布局：
- 每行 3 个卡片（响应式：移动端 1 个，平板 2 个）
- 每个卡片显示：集群名称、描述、状态、操作按钮

### 3. 集群权限过滤

**决策：** 前端过滤 + 后端 API 支持

- 后端：新增 `GET /api/v1/clusters/my` 端点供普通用户使用
- 前端：根据用户角色调用不同 API
  - 管理员：调用 `/api/v1/clusters`
  - 普通用户：调用 `/api/v1/clusters/my`

**替代方案考虑：**
- 只用前端过滤：传输不必要的数据
- 后端统一过滤：在查询参数中传递 `creator_id`
- 选择方案：前后端分离更清晰

## Risks / Trade-offs

- [风险] 子菜单样式可能与现有主题不匹配 → 需调整 CSS
- [风险] 卡片布局在大量集群时滚动不便 → 可后续添加分页或搜索

## Open Questions

无

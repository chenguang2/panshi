## Why

当前菜单结构扁平，缺少层级组织；集群管理页面使用表格样式，视觉呈现不够直观。同时，普通用户可以看到所有集群，存在权限控制问题。

## What Changes

1. **菜单重构** - 用户管理和字典管理合并到"系统管理"子菜单下
2. **集群卡片化** - 集群管理页面从表格展示改为卡片样式，更直观
3. **权限过滤** - 普通用户只能看到自己创建的集群，管理员可以看到所有集群
4. **API 调整** - 集群列表 API 增加按创建者过滤逻辑

## Capabilities

### New Capabilities
- `cluster-filter`: 按创建者过滤集群列表的能力（后端 + 前端）

### Modified Capabilities
- `cluster-management`: 修改集群列表返回逻辑，根据用户角色返回不同数据集
- `navigation-menu`: 修改菜单结构，新增系统管理子菜单

## Impact

### 后端
- `GET /api/v1/clusters` - 增加 creator_id 过滤逻辑
- 权限检查：普通用户只能查看自己创建的集群

### 前端
- `DefaultLayout.vue` - 菜单结构调整，添加子菜单
- `ClusterList.vue` - 表格改为卡片样式
- `UserList.vue` - 权限控制（已实现）
- `useAuthStore` - 可能需要新增方法判断是否为当前用户创建

### 测试
- 单元测试：`test_clusters.py` - 测试集群过滤逻辑
- Playwright：`cluster.spec.ts` - 测试卡片样式和权限过滤

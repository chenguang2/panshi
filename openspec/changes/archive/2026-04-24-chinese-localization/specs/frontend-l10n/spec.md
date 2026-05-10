# Frontend Localization Spec

## Overview
Frontend Chinese localization for Vue 3 components.

## Files to Modify

### 1. src/locales/zh-CN.ts (NEW)
Create Chinese locale file with translations for all UI strings.

### 2. src/views/Login.vue
- Title: "Panshi Admin" → "盘石管理后台"
- Username placeholder → "用户名"
- Password placeholder → "密码"
- Login button → "登录"
- Error messages → Chinese

### 3. src/views/Dashboard.vue
- Page title → "仪表盘"
- Welcome message → "欢迎使用盘石管理后台"

### 4. src/views/UserList.vue
- Page title → "用户管理"
- Table columns: Name→姓名, Username→用户名, Role→角色, Status→状态, Actions→操作
- Add button → "添加用户"
- Form labels in Chinese

### 5. src/views/ClusterList.vue
- Page title → "集群管理"
- Table columns: Name→名称, URI→地址, Status→状态, Actions→操作
- Add button → "添加集群"

### 6. src/views/ClusterDetail.vue
- Tabs: Upstreams→上游, Routes→路由, Plugins→插件
- Upstream table: Name→名称, Type→类型, Hosts→主机
- Route table: Name→名称, URI→URI, Methods→方法

### 7. src/views/DictTypeList.vue
- Page title → "字典管理"
- Table columns: Type Code→类型编码, Name→名称, Description→描述, Status→状态

### 8. src/views/DefaultLayout.vue
- Sidebar menu items in Chinese
- Dashboard → 仪表盘
- Users → 用户管理
- Clusters → 集群管理
- Dictionaries → 字典管理
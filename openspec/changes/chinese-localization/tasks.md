# Chinese Localization Tasks

## Frontend Localization

### 1.1 Create Chinese locale file
- [ ] Create `src/locales/zh-CN.ts` with all translations
- [ ] Export common terms, menu items, form labels

### 1.2 Login page (Login.vue)
- [ ] Title: "Panshi Admin" → "盘石管理后台"
- [ ] Username placeholder → "用户名"
- [ ] Password placeholder → "密码"
- [ ] Login button → "登录"
- [ ] Error messages → Chinese

### 1.3 Dashboard (Dashboard.vue)
- [ ] Page title → "仪表盘"
- [ ] Welcome message → "欢迎使用盘石管理后台"
- [ ] Statistics cards → Chinese labels

### 1.4 User management (UserList.vue)
- [ ] Page title → "用户管理"
- [ ] Table columns → Chinese
- [ ] Add user button → "添加用户"
- [ ] Form labels → Chinese
- [ ] Status labels → Chinese

### 1.5 Cluster management (ClusterList.vue)
- [ ] Page title → "集群管理"
- [ ] Table columns → Chinese
- [ ] Add button → "添加集群"
- [ ] Modal labels → Chinese

### 1.6 Cluster detail (ClusterDetail.vue)
- [ ] Tabs → Chinese (上游, 路由, 插件)
- [ ] Table columns → Chinese
- [ ] Add buttons → Chinese

### 1.7 Dictionary management (DictTypeList.vue)
- [ ] Page title → "字典管理"
- [ ] Table columns → Chinese
- [ ] Form labels → Chinese

### 1.8 Layout (DefaultLayout.vue)
- [ ] Sidebar menu items → Chinese
- [ ] User dropdown → Chinese

### 1.9 Components (UpstreamList.vue, RouteList.vue)
- [ ] Table columns → Chinese
- [ ] Button text → Chinese

## Backend Localization

### 2.1 Auth module
- [ ] Error messages → Chinese
- [ ] Success messages → Chinese

### 2.2 User module
- [ ] Validation errors → Chinese
- [ ] CRUD messages → Chinese

### 2.3 Cluster module
- [ ] Validation errors → Chinese
- [ ] CRUD messages → Chinese

### 2.4 Route module
- [ ] Validation errors → Chinese
- [ ] CRUD messages → Chinese

### 2.5 Dict module
- [ ] Validation errors → Chinese
- [ ] CRUD messages → Chinese

## Testing

### 3.1 Unit tests
- [ ] Create `tests/test_localization.py`
- [ ] Test backend Chinese messages
- [ ] Test frontend Chinese text presence

### 3.2 Playwright tests
- [ ] Update `e2e/login.spec.ts` for Chinese verification
- [ ] Update `e2e/cluster.spec.ts` for Chinese verification
- [ ] Verify Chinese text renders correctly

## Services

### 4.1 Start services
- [ ] Backend on port 9000
- [ ] Frontend on port 9100
- [ ] Verify all Chinese text displays correctly
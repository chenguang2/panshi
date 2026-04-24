# Chinese Localization Design

## Overview
Translate the entire Panshi Admin application from English to Chinese (Simplified).

## Scope

### Frontend (Vue 3 + TypeScript)
1. Login page - all labels, placeholders, button text
2. Dashboard - page title, welcome message
3. UserList - table columns, button text, form labels
4. ClusterList - table columns, button text, modal labels
5. ClusterDetail - tabs, table columns, form labels
6. DictTypeList - table columns, button text, form labels
7. DefaultLayout - sidebar menu items
8. Error messages and notifications

### Backend (FastAPI)
1. API validation error messages
2. Authentication error messages
3. Success/error responses
4. Logging messages

## Implementation Strategy

1. Create Chinese locale file for frontend
2. Update each Vue component to use i18n or inline Chinese
3. Update backend error messages to Chinese
4. Add unit tests verifying Chinese text presence

## Localization Files

### Frontend locales (src/locales/zh-CN.ts)
```typescript
export const zhCN = {
  common: {
    login: '登录',
    logout: '退出',
    add: '添加',
    edit: '编辑',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    search: '搜索',
    reset: '重置',
    ...
  },
  menu: {
    dashboard: '仪表盘',
    users: '用户管理',
    clusters: '集群管理',
    dictionaries: '字典管理',
  },
  login: {
    title: '盘石管理后台',
    username: '用户名',
    password: '密码',
    loginButton: '登录',
  },
  ...
}
```

## Testing
- Unit tests verify Chinese text in responses
- Playwright tests verify Chinese text renders correctly
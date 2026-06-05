## 1. 后端：新增跨集群插件组列表 API

- [x] 1.1 新增 `GET /api/v1/plugin_configs` 接口（分页/搜索/筛选/权限过滤）
- [x] 1.2 写 pytest 测试验证新接口

## 2. 前端：提取共享组件

- [x] 2.1 提取 PluginConfigFormModal.vue（含所属集群字段）
- [ ] 2.2 ClusterPluginConfigs.vue 保持内联表单（可选重构）

## 3. 前端：页面基础

- [x] 3.1 新增 `src/views/PluginConfigList.vue`（PageHeader + 集群筛选 + 添加按钮）
- [x] 3.2 新增路由 `/plugin-configs` → `PluginConfigList`
- [x] 3.3 侧边栏「核心功能」增加「插件组」菜单项

## 4. 卡片网格与操作

- [x] 4.1 实现 CSS Grid 卡片网格布局
- [x] 4.2 实现搜索 + 集群筛选
- [x] 4.3 实现卡片操作按钮（查看/编辑/删除/发布/版本管理）

## 5. 验证

- [x] 5.1 后端测试通过（2 tests）
- [x] 5.2 前端测试通过（162 passed, 26 files）
- [ ] 5.3 手动验证页面功能

## 1. 后端 API

- [ ] 1.1 确认 `/clusters/{cluster_id}/plugin-metadata` API 是否已实现
- [ ] 1.2 如果不存在，创建集群插件 metadata API 端点
- [ ] 1.3 实现 CRUD 接口（GET/POST/PUT/DELETE）
- [ ] 1.4 实现发布接口（调用 APISIX Admin API）
- [ ] 1.5 实现版本管理接口（历史记录、回滚）
- [ ] 1.6 在 BUILTIN_PLUGINS 中添加 `enable_metadata` 字段

## 2. 前端 - 全局插件数据结构和状态

- [ ] 2.1 在 Cluster 类型中添加 `globalPlugins`、`selectedGlobalPlugin`、`globalPluginsLoading` 字段
- [ ] 2.2 添加 `globalPluginsSearch` 字段
- [ ] 2.3 添加 `globalPluginsPagination` 字段

## 3. 前端 - 全局插件 Tab UI

- [ ] 3.1 在 `a-tabs` 中添加"全局插件" Tab（位置在集群节点和上游之间）
- [ ] 3.2 添加 Tab 内容区域（搜索框 + 左右两栏布局）
- [ ] 3.3 搜索框在顶部，用于搜索左侧插件

## 4. 前端 - 左侧插件列表

- [ ] 4.1 创建 `GlobalPluginSelector.vue` 组件
- [ ] 4.2 实现分类展示插件（限流、认证等）
- [ ] 4.3 每行显示 `[+添加]` 按钮
- [ ] 4.4 只显示 `enable_metadata=True` 的插件
- [ ] 4.5 实现搜索过滤功能

## 5. 前端 - 右侧已配置插件列表

- [ ] 5.1 定义 `globalPluginColumns` 和 `allGlobalPluginColumns`
- [ ] 5.2 显示插件名称、metadata 摘要、发布状态
- [ ] 5.3 操作按钮：[查看] [编辑] [删除] [发布] [版本]
- [ ] 5.4 按钮分组：基本操作组 | 同步管理组

## 6. 前端 - 查看抽屉

- [ ] 6.1 创建查看抽屉组件
- [ ] 6.2 Form 模式只读展示
- [ ] 6.3 JSON 模式只读展示
- [ ] 6.4 只有"关闭"按钮

## 7. 前端 - 编辑抽屉

- [ ] 7.1 创建编辑抽屉组件（或复用 PluginEditorDrawer）
- [ ] 7.2 Form/JSON 双模式切换
- [ ] 7.3 动态表单生成（根据插件 schema）
- [ ] 7.4 只有"保存"和"取消"按钮

## 8. 前端 - 删除功能

- [ ] 8.1 确认弹窗提示"删除会将插件状态实时重置为默认状态"
- [ ] 8.2 删除后：metadata={}，同步 APISIX，插件回左侧

## 9. 前端 - 版本管理

- [ ] 9.1 复用 `VersionManagementModal` 组件
- [ ] 9.2 新增 `resource-type="plugin_metadata"` 支持
- [ ] 9.3 版本历史列表
- [ ] 9.4 版本对比功能
- [ ] 9.5 回滚功能（回到那个版本号，不是 +1）

## 10. 前端 - 数据加载和绑定

- [ ] 10.1 实现 `loadGlobalPlugins` 函数
- [ ] 10.2 实现 `handleGlobalPluginAdd` 函数
- [ ] 10.3 实现 `handleGlobalPluginSave` 函数
- [ ] 10.4 实现 `handleGlobalPluginDelete` 函数
- [ ] 10.5 实现 `publishGlobalPlugin` 函数
- [ ] 10.6 绑定到 Tab 点击加载数据

## 11. 验证

- [ ] 11.1 运行后端测试 `cd backend && uv run pytest`
- [ ] 11.2 运行前端构建 `cd frontend && npm run build`
- [ ] 11.3 手动测试添加全局插件
- [ ] 11.4 手动测试编辑全局插件
- [ ] 11.5 手动测试删除全局插件
- [ ] 11.6 手动测试发布插件
- [ ] 11.7 手动测试版本管理
- [ ] 11.8 运行 Playwright 测试

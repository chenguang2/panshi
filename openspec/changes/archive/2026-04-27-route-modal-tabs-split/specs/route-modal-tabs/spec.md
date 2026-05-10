## Capability

`route-modal-tabs` - 将路由编辑弹窗拆分为 Tab 页

## Requirements

### FR-MT-001: 弹窗 Tab 布局
路由编辑弹窗（添加/编辑共用）使用 `a-tabs` 实现三 Tab 布局：
- Tab 1 label："基础配置"
- Tab 2 label："高级匹配"
- Tab 3 label："插件管理"

弹窗宽度不小于 `800px`。

### FR-MT-002: Tab 1 - 基础配置
保留现有全部表单字段：
- 名称（必填，文本输入）
- URI（必填，文本输入，支持路径通配符）
- 请求方法（多选：GET/POST/PUT/DELETE）
- 上游服务（下拉选择，可清空）
- 优先级（数字输入，最小值 0）
- 描述（文本域，2 行）
- 状态（单选：启用/禁用）

### FR-MT-003: Tab 2 - 高级匹配
当路由开启高级匹配（`advanced_match_enabled=true`）时：
- 展示 `RouteAdvancedMatch.vue` 组件
- 支持四类匹配条件：请求头、查询参数、Cookie、客户端IP
- 每条条件可设置：类型、键（header/query/cookie）、操作符（==/!=/~~/!~/~*/IN）、匹配值
- 支持动态添加/删除条件
- 构建输出为 APISIX 风格 `vars` 数组：`[[var_name, operator, value], ...]`
- IP 类型支持"等于"和"在范围内"两种匹配模式

当 `advanced_match_enabled=false` 时：
- Tab 2 内容区域显示提示文案："高级匹配未启用，请在基础配置中开启"

### FR-MT-004: Tab 3 - 插件管理
- 展示 `DraggablePluginGrid.vue` 组件
- 支持从插件列表中选择并添加到路由
- 插件支持拖拽排序
- 点击插件卡片编辑按钮，弹出 `PluginEditorDrawer.vue`
- 插件编辑器支持 JSON 模式（直接编辑 JSON）和表单模式（结构化字段）
- 支持删除已选插件

### FR-MT-005: 编辑态回填
编辑已有路由时：
- Tab 1 基础字段（名称/URI/方法/上游/优先级/描述/状态）从路由数据回填
- Tab 2 若 `advanced_match_enabled=true`，`vars` 字段经 `parseRulesFromVars()` 解析后回填到 `RouteAdvancedMatch.vue`
- Tab 3 从 `getRoutePlugins` API 加载插件列表，回填到 `DraggablePluginGrid.vue`

### FR-MT-006: 提交保存
点击弹窗确定按钮时：
- 基础配置字段参与提交 payload
- 高级匹配 vars 数组参与提交（若 advanced_match_enabled=true）
- 插件列表（含 config）参与提交
- 创建和更新分别调用对应 POST/PUT API

### FR-MT-007: 后端单元测试
`backend/tests/` 下新增 `test_route_advanced.py`，覆盖：
- 创建路由时 vars 字段的正确序列化和反序列化
- 更新路由时 advanced_match_enabled 和 vars 的变更校验
- 插件列表的创建和更新校验

### FR-MT-008: Playwright E2E 测试
`frontend/e2e/route-modal-tabs.spec.ts` 覆盖：
- TC-1: 点击"添加路由"按钮，弹窗三个 Tab 正确展示
- TC-2: Tab 1 填写基础字段后切换到 Tab 2，再切换回 Tab 1，数据保持
- TC-3: Tab 2 添加一条查询参数匹配条件，保存后重新编辑，数据正确回填
- TC-4: Tab 3 选择一个插件，编辑配置后保存，重新编辑插件配置正确回填
- TC-5: 编辑已有路由，三个 Tab 数据正确回填
- TC-6: 保存后路由列表中新增/编辑的路由包含正确的高级匹配和插件配置

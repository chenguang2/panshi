## Why

路由编辑弹窗（添加/编辑路由）当前将所有字段混在一个表单里，高级匹配和插件管理两个复杂功能没有独立的配置入口，导致：
1. 弹窗内容过于拥挤，用户找不到高级配置入口
2. 高级匹配和插件配置分散，体验不连贯
3. 无法单独为高级匹配和插件管理编写 E2E 测试场景

通过 Tab 拆分为「基础配置」「高级匹配」「插件管理」三个独立页面，可以改善可发现性和可维护性，并为后续独立功能扩展（如条件化插件、匹配规则复用）奠定基础。

## What Changes

- 编辑路由弹窗从单表单改为 `a-tabs` 三 Tab 布局
- **Tab 1 - 基础配置**：保留现有全部字段（名称/URI/请求方法/上游/优先级/描述/状态）
- **Tab 2 - 高级匹配**：集成 `RouteAdvancedMatch.vue`，支持请求头/查询参数/Cookie/客户端IP 四种匹配条件构建，输出 APISIX 风格 `vars` 数组
- **Tab 3 - 插件管理**：集成 `DraggablePluginGrid.vue`（插件选择/拖拽排序）+ `PluginEditorDrawer.vue`（JSON/表单双模式插件配置）
- 弹窗宽度从 `600px` 扩大到 `800px`
- 编辑路由时，高级匹配启用状态和 vars 值、已选插件列表应完整回填到对应 Tab
- 补充 `backend/tests/` 单元测试，覆盖路由 API 对 `vars` 和 `plugins` 字段的创建/更新校验
- Playwright E2E 测试覆盖：Tab 切换、高级匹配条件添加/删除/编辑、插件添加/配置/删除

## Capabilities

### New Capabilities
- `route-modal-tabs`: 将路由编辑弹窗拆分为三个 Tab 页签，隔离基础配置、高级匹配、插件管理三个配置域

### Modified Capabilities
- `route-actions-config`: 原有的路由操作配置能力不受影响，仅将配置入口从单表单改为 Tab 形式（实现细节变化，非需求变化）

## Impact

- **前端**：`RouteList.vue` 弹窗组件重构，新增 Tab 容器；`RouteAdvancedMatch.vue` 和 `DraggablePluginGrid.vue` / `PluginEditorDrawer.vue` 接入路由表单
- **后端**：`vars` 和 `plugins` 字段已在现有 API 中支持，无需新增 endpoint；单元测试补充
- **测试**：新增 Playwright E2E 场景 `e2e/route-modal-tabs.spec.ts`；补充 `backend/tests/test_route_advanced.py`

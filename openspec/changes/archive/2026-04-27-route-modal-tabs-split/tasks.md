## 1. Frontend - RouteList.vue Tab 重构

- [ ] 1.1 在 `RouteList.vue` 弹窗内将现有 `<a-form>` 包裹在 `<a-tabs>` 中，设置 `width="800px"` 和 `lazy=true`
- [ ] 1.2 Tab 1 "基础配置"：移入现有全部表单项（名称/URI/请求方法/上游/优先级/描述/状态）
- [ ] 1.3 在 `form` reactive 对象中加入 `advanced_match_enabled`、`vars`、`plugins` 字段
- [ ] 1.4 Tab 2 "高级匹配"：嵌入 `<RouteAdvancedMatch>`，传入 `:enabled="form.advanced_match_enabled"` 和 `:modelValue="{ vars: form.vars }"`，监听 `@update:modelValue` 回写 `form.vars`
- [ ] 1.5 Tab 3 "插件管理"：嵌入 `<DraggablePluginGrid>`，传入 `:modelValue="form.plugins"` 和 `:plugins="pluginList"`，监听 `@edit` 弹出 `PluginEditorDrawer`
- [ ] 1.6 修改 `showAddModal()` 初始化 `form` 的 `advanced_match_enabled=false`、`vars=[]`、`plugins=[]`
- [ ] 1.7 修改 `editRoute(route)` 额外调用 `loadRoutePlugins(route.id)` 并回填 `form.plugins` 和 `form.vars`（来自路由数据）
- [ ] 1.8 修改 `handleSubmit()` 将 `vars` 和 `plugins` 加入 payload 一并提交
- [ ] 1.9 从 `@/types` 导入 `RoutePlugin` 类型，确保 `form.plugins` 类型正确

## 2. Frontend - 插件数据加载

- [ ] 2.1 新增 `loadRoutePlugins(routeId)` 函数，调用 `GET /clusters/:clusterId/routes/:routeId/plugins`
- [ ] 2.2 在 `editRoute()` 中先调用 `loadRoutePlugins()`，再填充插件到 `form.plugins`
- [ ] 2.3 在 `showAddModal()` 中清空 `form.plugins`，避免残留

## 3. Frontend - 高级匹配启用联动

- [ ] 3.1 在 Tab 1 基础配置中加入"启用高级匹配"开关（`a-switch`），绑定 `form.advanced_match_enabled`
- [ ] 3.2 Tab 2 根据 `form.advanced_match_enabled` 显示组件或提示文案

## 4. Backend - 单元测试

- [ ] 4.1 新建 `backend/tests/test_route_advanced.py`
- [ ] 4.2 测试 `POST /clusters/:id/routes` 携带 `vars` 字段时路由创建成功，vars 正确存储
- [ ] 4.3 测试 `PUT /clusters/:id/routes/:id` 更新 `vars` 和 `advanced_match_enabled` 字段
- [ ] 4.4 测试路由更新 `plugins` 列表（添加/修改/删除插件）
- [ ] 4.5 测试 `GET /clusters/:id/routes/:id` 返回的 vars 为正确的 JSON 结构（反序列化）

## 5. Playwright E2E 测试

- [ ] 5.1 新建 `frontend/e2e/route-modal-tabs.spec.ts`
- [ ] 5.2 TC-1：验证添加路由弹窗有三个 Tab，Tab 1 为默认激活
- [ ] 5.3 TC-2：Tab 1 填写基础字段 → 切换 Tab 2 → 切换回 Tab 1，数据保持不变
- [ ] 5.4 TC-3：Tab 2 添加一条查询参数匹配条件（如 arg_version == v2）→ 保存 → 重新编辑 → 验证条件回填
- [ ] 5.5 TC-4：Tab 3 添加 ip-restriction 插件 → 编辑配置 → 保存 → 重新编辑 → 验证插件配置回填
- [ ] 5.6 TC-5：编辑已有路由，验证三个 Tab 数据完整回填
- [ ] 5.7 TC-6：发布路由后验证高级匹配和插件配置正确生效

## 6. 验证

- [ ] 6.1 启动后端 `uv run pytest backend/tests/test_route_advanced.py`，全部用例通过
- [ ] 6.2 启动前端 `npm run dev`，打开浏览器手动验证 Tab 切换、添加匹配条件、配置插件完整流程
- [ ] 6.3 运行 Playwright `npx playwright test frontend/e2e/route-modal-tabs.spec.ts`，全部用例通过
- [ ] 6.4 确认无 console error 和 linter 警告

## Context

现有 `RouteList.vue` 的路由编辑弹窗（`a-modal`）仅包含基础配置字段，宽度 `600px`。`RouteAdvancedMatch.vue`（匹配条件构建）和 `DraggablePluginGrid.vue` + `PluginEditorDrawer.vue`（插件管理）已作为独立组件存在，但未集成到路由编辑流程中。

## Goals / Non-Goals

**Goals:**
- 将路由编辑弹窗拆分为 Tab 布局，三个 Tab 各司其职
- 复用现有组件，保持行为一致
- 编辑态完整回填高级匹配（vars）和插件列表
- 补充后端单元测试和 Playwright E2E 测试

**Non-Goals:**
- 不新增 API endpoint，不修改数据结构
- 不重新设计 `RouteAdvancedMatch.vue` 和 `DraggablePluginGrid.vue` 内部逻辑
- 不实现路由级别的条件化插件（后续独立功能）

## Decisions

### 1. Tab 容器选型：`a-tabs` vs 自定义分段控件
**决定**：使用 Ant Design Vue 的 `a-tabs`，原因：
- 与现有 UI 框架一致（项目使用 ant-design-vue）
- 支持 Tab 懒加载（`:lazy="true"`），减少初始渲染负担
- 支持 `a-tab-pane` 锚点，无需自研

### 2. Tab 顺序：基础配置 → 高级匹配 → 插件管理
**决定**：沿用「基础优先、扩展在后」的认知顺序，与 PANSHI Dashboard 保持一致。

### 3. 弹窗宽度：`600px` → `800px`
**决定**：800px，理由：
- Tab 内容区需要足够宽度展示匹配条件行（type + key + operator + value 四字段）
- 插件卡片（200px 宽）在 800px 内最多显示 3 列，避免拥挤
- 超过 900px 与全屏体验冲突，不考虑

### 4. 高级匹配回填
**决定**：编辑路由时，从 `vars` JSON 字段解析出 `MatchRule[]`，通过 `RouteAdvancedMatch.vue` 的 `modelValue` prop 传入。
- 解析函数 `parseRulesFromVars()` 已存在于组件内，直接复用
- 无需新增 API 字段

### 5. 插件回填
**决定**：编辑路由时，通过 `getRoutePlugins` API 加载插件列表，通过 `DraggablePluginGrid.vue` 的 `modelValue` prop 传入。
- `RoutePlugin.config` 为 JSON 字符串，组件内 `hasConfig()` 解析判断"已配置"状态

### 6. 状态管理
**决定**：不做全局状态引入，在弹窗内部通过 `reactive` 表单对象管理三个 Tab 的数据。
- Tab 切换通过 `a-tabs` 的 `activeKey` 控制
- 高级匹配和插件的数据随弹窗关闭而丢弃；提交时才持久化

## Risks / Trade-offs

[Risk] Tab 切换时高级匹配/插件状态丢失（用户填写后切走但未保存）
→ [Mitigation] 弹窗关闭时若表单有变更，Ant Design Modal 会弹出确认；Tab 内数据保留在内存中，切走不会清空

[Risk] `RouteAdvancedMatch.vue` 的 `enabled` prop 若为 `false` 时隐藏整个组件，但 vars 仍可能存在
→ [Mitigation] Tab 2 内容始终渲染，仅在 enabled=false 时显示提示"请先在基础配置中启用高级匹配"，避免状态不一致

[Risk] 插件配置Drawer（`PluginEditorDrawer`）与 Tab 层次有冲突
→ [Mitigation] Drawer 的 `v-model:open` 由 `DraggablePluginGrid` 的 `edit` 事件触发，与 Tab 层级独立，不受影响

## Migration Plan

1. 修改 `RouteList.vue`，在弹窗内加入 `a-tabs`
2. 将基础表单移入 Tab 1，高级匹配移入 Tab 2，插件管理移入 Tab 3
3. 修改 `editRoute()` 函数，额外调用 `getRoutePlugins` 加载插件列表并写入 `form.plugins`
4. 修改 `handleSubmit()`，将 `vars`（来自高级匹配）和 `plugins`（来自插件管理）一起提交
5. 补充单元测试：`backend/tests/test_route_advanced.py`
6. 补充 Playwright E2E：`frontend/e2e/route-modal-tabs.spec.ts`
7. 验证 Tab 切换、编辑回填、提交保存全流程

**Rollback**：直接回退 `RouteList.vue` 到单表单版本，其他文件不变。

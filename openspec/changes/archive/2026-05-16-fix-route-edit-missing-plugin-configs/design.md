## Context

`EdgeClient.vue` 的路由编辑弹窗（`<a-modal>`，第 305-340 行）是一个基础表单，包含名称/URI/方法/域名/优先级/上游ID/插件JSON 等字段。`ClusterList.vue` 中已有完整的插件组选择功能（插件组 Tab，可勾选关联）。

`EdgeClient.vue` 中的 `loadPluginConfigs` 方法（第 609-616 行）**已存在**，会从边缘节点 API 加载插件组数据到 `pluginConfigs` 响应式变量。但路由编辑弹窗未使用该数据。

## Goals / Non-Goals

**Goals:**
- 路由编辑弹窗中增加插件组选择 UI，允许勾选/取消勾选插件组
- 编辑模式时从路由的 `plugin_config_ids` 回显已选插件组
- 提交创建/更新路由时携带 `plugin_config_ids`
- 与 ClusterList.vue 的交互方式保持一致（卡片式勾选）

**Non-Goals:**
- 不修改后端 API
- 不修改主管理页面（ClusterList.vue）的路由编辑逻辑
- 不改变插件组本身的管理功能

## Decisions

1. **复用 `loadPluginConfigs` 已加载的数据**
   - `pluginConfigs` 变量在页面加载时已填充，路由弹窗直接使用 `pluginConfigs.value` 渲染插件组列表
   - 无需新增 API 调用

2. **路由表单增加 `plugin_config_ids` 字段**
   - `routeForm` 新增 `plugin_config_ids: [] as string[]`
   - `showRouteModal` 编辑时：`routeForm.plugin_config_ids = [...(record.value.plugin_config_ids || [])]`
   - `showRouteModal` 创建时：`routeForm.plugin_config_ids = []`

3. **UI 采用卡片式勾选，与 ClusterList.vue 一致**
   - 在路由弹窗表单底部增加插件组区域
   - 每个插件组显示名称、版本号、包含的插件标签
   - 点击卡片/复选框切换选中状态

4. **提交时仅在 `plugin_config_ids` 非空时携带**
   - 与 ClusterList.vue 一致：`if (routeForm.plugin_config_ids.length > 0) payload.plugin_config_ids = routeForm.plugin_config_ids`

## Risks / Trade-offs

- **[UI 拥挤]** 路由表单已有较多字段，增加插件组区域可能显得拥挤。选择在表单字段下方追加，不额外增加 Tab
- **[与 ClusterList 差异]** 边缘节点编辑模式缺少插件 Tab（只有基础信息和插件组），因边缘节点的插件配置直接在 `plugins` JSON 编辑中处理，插件组作为补充手段

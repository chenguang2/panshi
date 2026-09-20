## Purpose

将路由编辑弹窗拆分为 Tab 页（基础配置 / 高级匹配 / 插件管理），降低长表单的认知负担，
并在两个入口（集群详情页与集群管理主页）保持一致的三 Tab 交互。

## Requirements

### Requirement: 弹窗 Tab 布局

路由编辑弹窗（添加/编辑/复制共用）SHALL 使用 `a-tabs` 实现三 Tab 布局：Tab 1「基础配置」、Tab 2「高级匹配」、Tab 3「插件管理」；弹窗宽度 SHALL 不小于 `800px`。

#### Scenario: 三个 Tab 正确展示

- **WHEN** 用户点击「添加路由」
- **THEN** 弹窗 SHALL 展示三个 Tab，标签依次为「基础配置」「高级匹配」「插件管理」
- **AND** 弹窗宽度 SHALL 不小于 `800px`

#### Scenario: 两个入口行为一致

- **WHEN** 分别从集群详情页（`RouteList.vue`）与集群管理主页（`ClusterList.vue`）打开路由弹窗
- **THEN** 两处 SHALL 使用相同的三 Tab 布局与交互

### Requirement: Tab 1 基础配置

Tab 1 SHALL 保留全部基础表单字段：名称（必填）、URI（必填，支持路径通配符）、请求方法（多选 GET/POST/PUT/DELETE）、上游服务（下拉，可清空）、优先级（数字，最小值 0）、描述（2 行文本域）、状态（启用/禁用）；高级匹配开关 SHALL 以「开/关」文案样式呈现。

#### Scenario: 字段完整可编辑

- **WHEN** 用户切换到 Tab 1
- **THEN** 上述全部字段 SHALL 可见且可编辑
- **AND** 高级匹配开关 SHALL 显示为「开/关」样式

#### Scenario: 切换 Tab 不丢数据

- **WHEN** 用户在 Tab 1 填写基础字段后切换到 Tab 2，再切回 Tab 1
- **THEN** 已填写内容 SHALL 保持不变

### Requirement: Tab 2 高级匹配

当路由开启高级匹配（`advanced_match_enabled=true`）时，Tab 2 SHALL 展示 `RouteAdvancedMatch.vue`，支持请求头 / 查询参数 / Cookie / 客户端 IP 四类匹配条件；每条条件 SHALL 可设置类型、键（header/query/cookie）、操作符（`==` / `!=` / `~~` / `!~` / `~*` / `IN`）与匹配值，并 SHALL 支持动态添加与删除；构建输出 SHALL 为 PANSHI 风格 `vars` 数组 `[[var_name, operator, value], ...]`；IP 类型 SHALL 支持「等于」与「在范围内」两种模式。当 `advanced_match_enabled=false` 时，Tab 2 SHALL 显示提示文案「高级匹配未启用，请在基础配置中开启」。

#### Scenario: 添加条件保存后正确回填

- **WHEN** 用户在 Tab 2 添加一条查询参数匹配条件并保存，随后重新编辑该路由
- **THEN** `vars` 数组 SHALL 由 `parseRulesFromVars()` 解析并正确回填到条件列表

#### Scenario: 未启用时的提示

- **WHEN** `advanced_match_enabled=false` 时用户切换到 Tab 2
- **THEN** 内容区 SHALL 显示「高级匹配未启用，请在基础配置中开启」

### Requirement: Tab 3 插件管理

Tab 3 SHALL 展示 `DraggablePluginGrid.vue`：支持从插件列表选择并添加到路由、插件拖拽排序、点击插件卡片编辑按钮弹出 `PluginEditorDrawer.vue`（支持 JSON 模式与表单模式）、删除已选插件；编辑已有路由时 SHALL 通过 `getRoutePlugins` 接口加载插件列表并回填。

#### Scenario: 插件配置保存后正确回填

- **WHEN** 用户在 Tab 3 选择一个插件、编辑其配置并保存，随后重新编辑该路由
- **THEN** 插件配置 SHALL 正确回填到 `DraggablePluginGrid.vue`

#### Scenario: 拖拽排序生效

- **WHEN** 用户拖拽调整插件顺序后保存
- **THEN** 提交的插件列表顺序 SHALL 与拖拽后的顺序一致

### Requirement: 编辑态回填

编辑已有路由时，Tab 1 SHALL 回填基础字段（名称/URI/方法/上游/优先级/描述/状态）；Tab 2 在 `advanced_match_enabled=true` 时 SHALL 将 `vars` 解析后回填到 `RouteAdvancedMatch.vue`；Tab 3 SHALL 回填插件列表。

#### Scenario: 三个 Tab 数据正确回填

- **WHEN** 用户编辑一条已有路由
- **THEN** 三个 Tab 的字段与配置 SHALL 与保存时一致

#### Scenario: 打开弹窗时重置到基础 Tab

- **WHEN** 用户打开添加、编辑或复制路由弹窗
- **THEN** 活动 Tab SHALL 重置为「基础配置」

### Requirement: 提交保存

点击弹窗确定按钮时，提交载荷 SHALL 包含基础配置字段；当 `advanced_match_enabled=true` 时 SHALL 包含 `vars` 数组；SHALL 包含插件列表（含 config）；创建与更新 SHALL 分别调用对应的 POST / PUT 接口。

#### Scenario: 保存后列表生效

- **WHEN** 用户保存新增或编辑的路由
- **THEN** 路由列表 SHALL 包含正确的高级匹配与插件配置

### Requirement: 测试覆盖

本能力 SHALL 由后端单元测试与前端 E2E 覆盖：`backend/tests/test_route_advanced.py` SHALL 覆盖 vars 序列化/反序列化、`advanced_match_enabled` 与 `vars` 的变更校验、插件列表的创建与更新校验；`frontend/e2e/route-modal-tabs.spec.ts` SHALL 覆盖 TC-1 ~ TC-6（Tab 展示、切换保数据、高级匹配回填、插件配置回填、编辑回填、保存后列表正确）。

#### Scenario: 后端用例通过

- **WHEN** 运行 `backend/tests/test_route_advanced.py`
- **THEN** vars 序列化/反序列化、变更校验与插件校验用例 SHALL 全部通过

#### Scenario: 前端 E2E 用例通过

- **WHEN** 运行 `frontend/e2e/route-modal-tabs.spec.ts`
- **THEN** TC-1 ~ TC-6 六个用例 SHALL 全部通过

## Implementation Notes

### 实施范围

本变更在两个路由弹窗位置实施：

1. **RouteList.vue**（`ClusterDetail` 子组件）— 集群详情页 → 路由 Tab → 添加/编辑路由
2. **ClusterList.vue** — 集群管理主页 → 集群卡片 → 路由 Tab → 添加/编辑路由

两处弹窗均使用相同的 3-tab 布局实现。

### 关键实现细节

- `ClusterList.vue` 中添加 `routeModalActiveTab` ref 控制 Tab 切换
- `ClusterList.vue` 中 `showAddRouteModal()`、`editRouteByRecord()`、`copyRouteByRecord()` 末尾重置 `routeModalActiveTab.value = 'basic'`
- `ClusterList.vue` 导入 `WarningOutlined` 图标，用于高级匹配未启用时的提示
- 弹窗宽度统一使用 `800px`
- Tab 1 高级匹配开关使用 `checked-children="开" un-checked-children="关"` 替代默认样式
- Tab 2 未启用时显示警告提示，引导用户在 Tab 1 开启

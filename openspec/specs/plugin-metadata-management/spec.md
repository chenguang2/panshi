## Purpose

插件元数据的跨集群统一管理功能，包括卡片网格列表、新建、查看、编辑、删除、发布、版本管理。

## Requirements

### Requirement: 独立插件元数据管理页面

系统 SHALL 提供一个独立插件元数据管理页面，以卡片网格形式列出所有集群的所有插件元数据。

#### Scenario: 页面入口
- **WHEN** 用户点击侧边栏"核心功能"区域的"插件元数据"菜单项
- **THEN** 导航到 `/plugin-metadata` 路由
- **AND** 页面显示 `PageHeader`，标题为"插件元数据"

#### Scenario: 卡片网格展示
- **WHEN** 页面加载完成
- **THEN** 以 3 列卡片网格展示所有插件元数据
- **AND** 每张卡片显示：插件名称（`plugin_name`）、所属集群、版本号（`current_version`）、`PublishStatusTag` 发布状态标签
- **AND** 状态为四态单一表达（未发布 / 待发布 / 发布未完全生效 / 已发布 vX + 真实发布时间），MUST NOT 出现 badge 与状态标签双显，`publishedAt` MUST NOT 使用 `updated_at`

#### Scenario: 集群筛选
- **WHEN** 用户从集群筛选下拉框中选择一个集群
- **THEN** 仅显示该集群的插件元数据卡片

#### Scenario: 搜索
- **WHEN** 用户在搜索框中输入文本
- **THEN** 按插件名称（`plugin_name`）模糊搜索

#### Scenario: 分页
- **WHEN** 插件元数据条目超过每页显示数量
- **THEN** 页面底部显示分页控件

### Requirement: 查看插件元数据

用户 SHALL 能够查看插件元数据的详细配置内容。

#### Scenario: 查看详情
- **WHEN** 用户点击卡片上的"查看"按钮
- **THEN** 打开 Drawer 或 Modal，显示插件名称、集群、版本、状态、创建时间、更新时间以及配置数据（JSON 格式化展示）
- **AND** 版本行条件渲染：有发布版本显示 `v{N}`，无发布版本显示"未发布"（灰态文本），MUST NOT 渲染出"v未发布"拼接串

### Requirement: 编辑插件元数据

用户 SHALL 能够编辑插件元数据的配置内容。

#### Scenario: 编辑配置
- **WHEN** 用户点击卡片上的"编辑"按钮
- **THEN** 打开 `PluginEditorDrawer`，显示当前 `config_data`
- **AND** 编辑器支持表单模式（基于 plugin schema 渲染）和 JSON 模式两种方式
- **AND** 保存时调用 `PUT /clusters/{cluster_id}/plugin-metadata/{plugin_name}` 更新

### Requirement: 新建插件元数据

用户 SHALL 能够在跨集群页面中新建插件元数据。

#### Scenario: 新建流程
- **WHEN** 用户点击 PageHeader 的"+ 添加插件元数据"按钮
- **THEN** 弹出新建 Modal，包含集群选择器和插件名称选择器
- **AND** 插件列表从 `GET /plugins/builtin` 获取，仅显示 `enable_metadata=true` 且未配置的插件
- **AND** 点击"保存"后调用 `POST /clusters/{cluster_id}/plugin-metadata?plugin_name={name}` 创建空记录
- **AND** 创建成功关闭 Modal 并刷新列表
- **AND** 提示"创建后可在列表页编辑配置"

### Requirement: 删除插件元数据

用户 SHALL 能够删除插件元数据，支持选择是否同时从 Edge 节点删除。

#### Scenario: 删除流程
- **WHEN** 用户点击卡片上的"删除"按钮
- **THEN** 弹出删除确认对话框（`showDeleteConfirm`），可选：从数据库删除、从 Edge 节点删除、选择目标节点
- **AND** 确认后调用 DELETE API 并显示进度

### Requirement: 发布插件元数据

用户 SHALL 能够将插件元数据发布到集群的 Edge 节点。

发布后后端 SHALL 自动调用 `PUT /edge/admin/plugins/reload` 触发 Edge 节点重载插件，使元数据立即生效。

#### Scenario: 发布流程
- **WHEN** 用户点击卡片上的"发布"按钮
- **THEN** 弹出 `PublishConfirmModal` 选择目标节点
- **AND** 确认后调用 publish API
- **AND** 后端将插件元数据推送到 Edge 节点
- **AND** 推送成功后自动调用插件 reload 接口（`PUT /edge/admin/plugins/reload`）
- **AND** reload 调用结果记录到 Edge 日志
- **AND** 前端显示进度和节点同步结果

### Requirement: 版本管理

用户 SHALL 能够查看版本历史、回滚、删除历史版本。

#### Scenario: 版本管理
- **WHEN** 用户点击卡片上的"版本管理"按钮
- **THEN** 打开 `VersionManagementModal`（`resourceType=plugin_metadata`）
- **AND** 显示版本历史、配置 diff、支持回滚和删除非当前版本

#### Scenario: 恢复后发布出口条
- **WHEN** 用户在版本管理中恢复某历史版本成功
- **THEN** 弹窗内显示发布出口条（「已恢复到 v{N}（平台侧）。请发布以推送到 Edge 节点」+「立即发布恢复的配置」按钮）
- **AND** 出口条仅经 `canPublish` 接线的调用方显示
- **AND** 回滚仅恢复平台侧配置，界面明确提示需发布后才在 Edge 生效，MUST NOT 静默呈现"已生效"假象

#### Scenario: 出口条立即发布
- **WHEN** 用户点击出口条的"立即发布恢复的配置"
- **THEN** 调用方以当前版本弹窗上下文的资源复用既有发布链路（`PublishConfirmModal` 选择节点 → 共享发布流程）
- **AND** 发布成功后刷新页面列表并重载版本弹窗的版本列表

### Requirement: 统一管理 Tab 行为契约一致

统一管理 Tab 的插件元数据面板 SHALL 与独立页共享同一套行为契约实现（确认弹窗、发布流程、删除进度、状态展示），MUST NOT 复制共享流程的内联实现。

#### Scenario: 删除走共享进度实现
- **WHEN** 用户在统一管理 Tab 删除插件元数据
- **THEN** 先经 `showDeleteConfirm` 确认（数据库/Edge 范围与节点选择行为不变）
- **AND** 进度渲染、节点循环日志、终态汇总走共享 `executeDeleteWithProgress`
- **AND** Tab 内不保留手写进度弹窗实现

#### Scenario: 状态与版本文案一致
- **WHEN** 统一管理 Tab 渲染插件元数据状态与版本
- **THEN** 状态为 `PublishStatusTag` 四态单一表达（与独立页同参数）
- **AND** 查看抽屉版本文案与独立页一致（无发布版本显示"未发布"，不出现"v未发布"）

#### Scenario: 恢复出口条一致
- **WHEN** 用户在统一管理 Tab 版本管理中恢复历史版本成功
- **THEN** 与独立页同样显示发布出口条并可立即发布

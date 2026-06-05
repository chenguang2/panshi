## ADDED Requirements

### Requirement: 独立插件元数据管理页面

系统 SHALL 提供一个独立插件元数据管理页面，以卡片网格形式列出所有集群的所有插件元数据。

#### Scenario: 页面入口
- **WHEN** 用户点击侧边栏"核心功能"区域的"插件元数据"菜单项
- **THEN** 导航到 `/plugin-metadata` 路由
- **AND** 页面显示 `PageHeader`，标题为"插件元数据"

#### Scenario: 卡片网格展示
- **WHEN** 页面加载完成
- **THEN** 以 3 列卡片网格展示所有插件元数据
- **AND** 每张卡片显示：插件名称（`plugin_name`）、所属集群、版本号（`current_version`）、已发布/未发布状态 badge
- **AND** 未发布时显示"未发布"badge，已发布时显示"已发布"badge

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

### Requirement: 编辑插件元数据

用户 SHALL 能够编辑插件元数据的配置内容。

#### Scenario: 编辑配置
- **WHEN** 用户点击卡片上的"编辑"按钮
- **THEN** 打开 Modal，使用 `JsonEditorVue` 显示当前 `config_data`
- **AND** 用户可以修改 JSON 内容
- **AND** 保存时调用 `PUT /clusters/{cluster_id}/plugin-metadata/{plugin_name}` 更新

### Requirement: 新建插件元数据

用户 SHALL 能够在跨集群页面中新建插件元数据。

#### Scenario: 新建流程
- **WHEN** 用户点击 PageHeader 的"+ 添加插件元数据"按钮
- **THEN** 弹出新建 Modal
- **AND** Modal 包含：集群选择器、插件名称选择器（从 `GET /plugins/builtin` 获取，仅显示 `enable_metadata=true` 且未配置的插件）、JSON 编辑器（默认 `{}`）
- **AND** 点击"创建"后调用 `POST /clusters/{cluster_id}/plugin-metadata?plugin_name={name}` 创建
- **AND** 创建成功关闭 Modal 并刷新列表

### Requirement: 删除插件元数据

用户 SHALL 能够删除插件元数据，支持选择是否同时从 Edge 节点删除。

#### Scenario: 删除流程
- **WHEN** 用户点击卡片上的"删除"按钮
- **THEN** 弹出删除确认对话框（`showDeleteConfirm`），可选：从数据库删除、从 Edge 节点删除、选择目标节点
- **AND** 确认后调用 DELETE API 并显示进度

### Requirement: 发布插件元数据

用户 SHALL 能够将插件元数据发布到集群的 Edge 节点。

#### Scenario: 发布流程
- **WHEN** 用户点击卡片上的"发布"按钮
- **THEN** 弹出 `PublishConfirmModal` 选择目标节点
- **AND** 确认后调用 publish API
- **AND** 显示进度和节点同步结果

### Requirement: 版本管理

用户 SHALL 能够查看版本历史、回滚、删除历史版本。

#### Scenario: 版本管理
- **WHEN** 用户点击卡片上的"版本管理"按钮
- **THEN** 打开 `VersionManagementModal`（`resourceType=plugin_metadata`）
- **AND** 显示版本历史、配置 diff、支持回滚和删除非当前版本
